import { ALLOWED_AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, type AdminEpisodeDto } from '@ongod/shared';
import { Button, FileField, Notice, useToast } from '@ongod/ui-web';
import { DetailedError, Upload } from 'tus-js-client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, refreshSession, session } from '../api/client';
import { useEpisodeActions, useInvalidate } from '../api/queries';
import { MediaBadge } from '../components/bits';
import { ConfirmDialog } from '../components/Modal';
import { formatBytes, formatDuration } from '../lib/format';
import { mn } from '../i18n/mn';

/** Where the API's tus endpoint lives (an absolute URL keeps the resume fingerprint stable). */
const endpoint = () => `${window.location.origin}/v1/admin/uploads/`;
/** Each chunk is its own request, so a dropped connection loses at most one chunk. */
const CHUNK_BYTES = 5 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10_000, 20_000];

type Phase = 'idle' | 'uploading' | 'paused' | 'error';

/** Remembers that an upload was started, so a refreshed page can ask for the same file again. */
const hintKey = (episodeId: string) => `ongod:admin-upload:${episodeId}`;
const hint = {
  read(episodeId: string): { name: string; size: number } | undefined {
    try {
      const raw = localStorage.getItem(hintKey(episodeId));
      return raw ? (JSON.parse(raw) as { name: string; size: number }) : undefined;
    } catch {
      return undefined;
    }
  },
  write(episodeId: string, value: { name: string; size: number }) {
    try {
      localStorage.setItem(hintKey(episodeId), JSON.stringify(value));
    } catch {
      // Blocked storage: resuming still works while the page stays open.
    }
  },
  clear(episodeId: string) {
    try {
      localStorage.removeItem(hintKey(episodeId));
    } catch {
      // see above
    }
  },
};

/** How many bytes of an unfinished upload the server already has; undefined if it is gone. */
async function serverOffset(uploadUrl: string): Promise<number | undefined> {
  const head = () =>
    fetch(uploadUrl, {
      method: 'HEAD',
      headers: { 'Tus-Resumable': '1.0.0', Authorization: `Bearer ${session.token() ?? ''}` },
    });
  try {
    let res = await head();
    if (res.status === 401 && (await refreshSession())) res = await head();
    const offset = Number(res.headers.get('Upload-Offset'));
    return res.ok && Number.isFinite(offset) ? offset : undefined;
  } catch {
    // Offline right now: let tus try (and retry) on its own.
    return 0;
  }
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

function describe(err: Error): string {
  if (err instanceof DetailedError) {
    // The tus server answers rejections with a plain Mongolian text body.
    const body = err.originalResponse?.getBody().trim();
    if (body && body.length < 200 && !body.startsWith('<')) return body;
  }
  return err instanceof ApiError ? err.message : mn.episodes.audio.uploadFailed;
}

export function AudioUploader({ episode }: { episode: AdminEpisodeDto }) {
  const t = mn.episodes.audio;
  const invalidate = useInvalidate();
  const upload = useRef<Upload>(undefined);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [fileName, setFileName] = useState('');
  const [resumedFrom, setResumedFrom] = useState<number>();
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string }>();
  const [cancelling, setCancelling] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const media = episode.media;
  // Set on a refreshed page: the server still has the half-finished upload, the file is gone.
  const pending =
    phase === 'idle' && media?.status === 'UPLOADING' ? hint.read(episode.id) : undefined;

  // Leaving the page pauses the upload; the stored fingerprint lets a later visit continue it.
  useEffect(
    () => () => {
      void upload.current?.abort();
    },
    [],
  );

  function begin(file: File) {
    setMessage(undefined);
    setResumedFrom(undefined);
    if (!(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
      setMessage({ tone: 'danger', text: t.invalidType });
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setMessage({ tone: 'danger', text: t.tooLarge });
      return;
    }

    const next = new Upload(file, {
      endpoint: endpoint(),
      chunkSize: CHUNK_BYTES,
      retryDelays: RETRY_DELAYS_MS,
      metadata: { episodeId: episode.id, filename: file.name, filetype: file.type },
      // The token changes every ~15 minutes, so it is read again for every request.
      onBeforeRequest: (req) => {
        const token = session.token();
        if (token) req.setHeader('Authorization', `Bearer ${token}`);
      },
      onAfterResponse: async (_req, res) => {
        if (res.getStatus() === 401) await refreshSession();
      },
      onShouldRetry: (err, attempt) => {
        const status = err.originalResponse?.getStatus() ?? 0;
        if (status === 401) return attempt < RETRY_DELAYS_MS.length;
        // Other 4xx answers are real rejections (type, size, state); network and 5xx are retried.
        return (
          (status === 0 || status >= 500 || status === 409 || status === 423) &&
          attempt < RETRY_DELAYS_MS.length
        );
      },
      onProgress: (sent, total) => setProgress({ sent, total }),
      onSuccess: () => {
        hint.clear(episode.id);
        upload.current = undefined;
        setPhase('idle');
        setPickerKey((key) => key + 1);
        setMessage({ tone: 'success', text: t.done });
        void invalidate('episode', 'episodes');
      },
      onError: (err) => {
        setPhase('error');
        setMessage({ tone: 'danger', text: describe(err) });
      },
    });
    upload.current = next;
    setFileName(file.name);
    setProgress({ sent: 0, total: file.size });
    setPhase('uploading');
    hint.write(episode.id, { name: file.name, size: file.size });

    // A refreshed page or a dropped connection: the same file continues where the server stopped.
    void next.findPreviousUploads().then(async (previous) => {
      const found = previous[0];
      const offset = found?.uploadUrl ? await serverOffset(found.uploadUrl) : undefined;
      // The server keeps an unfinished upload for a week; after that it answers 404 and tus
      // starts a new one instead.
      if (found && offset !== undefined) {
        next.resumeFromPreviousUpload(found);
        if (offset > 0) {
          setProgress({ sent: offset, total: file.size });
          setResumedFrom(Math.floor((offset / file.size) * 100));
        }
      }
      next.start();
    });
  }

  function pause() {
    void upload.current?.abort();
    setPhase('paused');
  }

  function resume() {
    setMessage(undefined);
    setPhase('uploading');
    upload.current?.start();
  }

  async function cancel() {
    const current = upload.current;
    upload.current = undefined;
    // Terminating tells the server to forget the partial file.
    await current?.abort(true).catch(() => undefined);
    hint.clear(episode.id);
    setPhase('idle');
    setPickerKey((key) => key + 1);
    void invalidate('episode');
  }

  const percent = progress.total > 0 ? Math.floor((progress.sent / progress.total) * 100) : 0;
  const active = phase === 'uploading' || phase === 'paused' || phase === 'error';

  return (
    <div className="admin-uploader">
      {media ? (
        <div className="admin-uploader__status">
          <MediaBadge status={media.status} />
          {media.sizeBytes !== null ? (
            <span>
              {t.size}: {formatBytes(media.sizeBytes)}
            </span>
          ) : null}
          {media.durationSec !== null ? (
            <span>
              {t.duration}: {formatDuration(media.durationSec)}
            </span>
          ) : null}
        </div>
      ) : null}

      {media?.status === 'FAILED' ? <FailedMedia episode={episode} /> : null}

      {pending ? <Notice tone="info">{t.resumeFound(pending.name)}</Notice> : null}
      {/* "stored, processing" must not stay on screen once processing has failed */}
      {message && !(message.tone === 'success' && media?.status === 'FAILED') ? (
        <Notice tone={message.tone}>{message.text}</Notice>
      ) : null}

      {active ? (
        <div className="admin-uploader__progress">
          <p>
            <strong>{fileName}</strong>
          </p>
          <progress max={progress.total || 1} value={progress.sent} aria-label={fileName} />
          <p aria-live="polite">
            {t.progress(formatBytes(progress.sent), formatBytes(progress.total), percent)}
            {resumedFrom !== undefined ? ` · ${t.resumedFrom(resumedFrom)}` : ''}
          </p>
          <div className="admin-uploader__actions">
            {phase === 'uploading' ? (
              <Button variant="secondary" onClick={pause}>
                {t.pause}
              </Button>
            ) : (
              <Button onClick={resume}>{t.resume}</Button>
            )}
            <Button variant="ghost" onClick={() => setCancelling(true)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <FileField
          key={pickerKey}
          label={t.choose}
          hint={media && media.status !== 'FAILED' ? `${t.hint} ${t.replaceNotice}` : t.hint}
          accept={ALLOWED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) begin(file);
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling}
        title={t.cancelTitle}
        text={t.cancelConfirm}
        confirmLabel={t.cancel}
        tone="destructive"
        onClose={() => setCancelling(false)}
        onConfirm={cancel}
      />
    </div>
  );
}

function FailedMedia({ episode }: { episode: AdminEpisodeDto }) {
  const t = mn.episodes.audio;
  const toast = useToast();
  const { transition } = useEpisodeActions(episode.id);

  return (
    <Notice tone="danger" title={t.failedTitle}>
      <p>{episode.media?.failReason ?? mn.common.errorGeneric}</p>
      <Button
        variant="secondary"
        loading={transition.isPending}
        onClick={() =>
          transition.mutate('media/retry', {
            onSuccess: () => toast.show(t.retried, { tone: 'success' }),
          })
        }
      >
        {t.retry}
      </Button>
    </Notice>
  );
}
