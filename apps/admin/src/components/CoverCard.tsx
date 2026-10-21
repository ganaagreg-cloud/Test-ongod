import { MAX_COVER_BYTES } from '@ongod/shared';
import { FileField, Notice, useToast } from '@ongod/ui-web';
import { useEffect, useRef, useState } from 'react';
import { mn } from '../i18n/mn';
import { errorText } from './Modal';

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface CoverCardProps {
  coverUrl: string | null;
  alt: string;
  upload: (file: File) => Promise<unknown>;
  refetch: () => void;
}

/** Cover picture of a series or playlist: the same upload flow as the episode page. */
export function CoverCard({ coverUrl, alt, upload, refetch }: CoverCardProps) {
  const t = mn.episodes.cover;
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [pickerKey, setPickerKey] = useState(0);
  const [pending, setPending] = useState(false);
  // The server resizes the cover in the background; look again every 2 s for a short while.
  const [waiting, setWaiting] = useState(false);
  const lastUrl = useRef(coverUrl);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(refetch, 2000);
    const stop = setTimeout(() => setWaiting(false), 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, refetch]);

  useEffect(() => {
    if (coverUrl !== lastUrl.current) {
      lastUrl.current = coverUrl;
      setWaiting(false);
    }
  }, [coverUrl]);

  async function choose(file: File) {
    setError(undefined);
    if (!COVER_TYPES.includes(file.type) || file.size > MAX_COVER_BYTES) {
      setError(t.hint);
      return;
    }
    setPending(true);
    try {
      await upload(file);
      setWaiting(true);
      setPickerKey((key) => key + 1);
      toast.show(t.uploaded, { tone: 'success' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-cover">
      {coverUrl ? (
        <img className="admin-cover__image" src={coverUrl} alt={alt} />
      ) : (
        <p className="admin-hint">{t.none}</p>
      )}
      {waiting ? <Notice tone="info">{t.processing}</Notice> : null}
      <FileField
        key={pickerKey}
        label={t.choose}
        hint={t.hint}
        accept={COVER_TYPES.join(',')}
        disabled={pending}
        {...(error ? { error } : {})}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />
      {pending ? <p aria-live="polite">{t.uploading}</p> : null}
    </div>
  );
}
