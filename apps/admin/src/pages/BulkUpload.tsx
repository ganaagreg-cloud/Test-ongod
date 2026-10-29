import { useQuery } from '@tanstack/react-query';
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  maxBytesOf,
  mediaKindOfFile,
  type MediaKind,
} from '@ongod/shared';
import { Button, Icon, Notice } from '@ongod/ui-web';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { categoriesQuery, useEpisodeActions, useInvalidate } from '../api/queries';
import { PageHeader, SelectField } from '../components/bits';
import { DropZone } from '../components/DropZone';
import { LeaveGuard } from '../components/LeaveGuard';
import { errorText } from '../components/Modal';
import { formatBytes } from '../lib/format';
import { lastCategory, startingCategory, titleFromFileName } from '../lib/media';
import { mn } from '../i18n/mn';
import { createEpisodeUpload, describeUploadError } from '../upload/tusUpload';

const t = mn.episodes.bulkUpload;

const ACCEPT = [...ALLOWED_AUDIO_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]
  .map((ext) => `.${ext}`)
  .join(',');

type Status = 'waiting' | 'creating' | 'uploading' | 'done' | 'failed' | 'invalid';

interface Item {
  key: string;
  file: File;
  kind: MediaKind | null;
  status: Status;
  sent: number;
  /** Why the file was refused, or why its draft or upload failed. */
  message?: string;
  episodeId?: string;
}

/** A file the API would refuse is shown with the reason and never sent. */
function itemOf(file: File): Item {
  const kind = mediaKindOfFile(file.name);
  const key = `${file.name}|${file.size}|${file.lastModified}`;
  if (!kind) {
    return { key, file, kind, status: 'invalid', sent: 0, message: mn.episodes.audio.invalidType };
  }
  if (file.size > maxBytesOf(kind)) {
    const message = mn.episodes.audio.tooLarge(formatBytes(maxBytesOf(kind)));
    return { key, file, kind, status: 'invalid', sent: 0, message };
  }
  return { key, file, kind, status: 'waiting', sent: 0 };
}

/**
 * "Олон файл" (ADR-0070): several audio or video files at once, one draft each (the title from the
 * file name, one category for all), sent one after another. Cover, description and publishing are
 * done on each draft afterwards; a video gets its cover from the video (ADR-0069).
 */
export function BulkUploadPage() {
  const categories = useQuery(categoriesQuery());
  const list = categories.data?.categories ?? [];
  const { create } = useEpisodeActions(undefined);
  const invalidate = useInvalidate();

  const [categoryId, setCategoryId] = useState('');
  // The remembered (or only) category, once the list is there.
  const picked = useRef(false);
  const loaded = categories.data?.categories;
  useEffect(() => {
    if (picked.current || !loaded || loaded.length === 0) return;
    picked.current = true;
    setCategoryId(
      startingCategory(
        loaded.map((c) => c.id),
        lastCategory.read(),
      ),
    );
  }, [loaded]);

  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const patch = (key: string, change: Partial<Item>) =>
    setItems((all) => all.map((item) => (item.key === key ? { ...item, ...change } : item)));

  function add(files: File[]) {
    setItems((all) => {
      const known = new Set(all.map((item) => item.key));
      return [...all, ...files.map(itemOf).filter((item) => !known.has(item.key))];
    });
  }

  /** One file: its draft, then its upload; resolves either way so the next one can go. */
  async function send(item: Item): Promise<void> {
    patch(item.key, { status: 'creating', message: undefined });
    let episodeId = item.episodeId;
    try {
      if (!episodeId) {
        const { episode } = await create.mutateAsync({
          title: titleFromFileName(item.file.name) || item.file.name,
          description: '',
          categoryId,
        });
        episodeId = episode.id;
        patch(item.key, { episodeId });
      }
    } catch (err) {
      patch(item.key, { status: 'failed', message: errorText(err) });
      return;
    }
    patch(item.key, { status: 'uploading', sent: 0 });
    await new Promise<void>((resolve) => {
      const upload = createEpisodeUpload(item.file, episodeId, {
        onProgress: (sent) => patch(item.key, { sent }),
        onSuccess: () => {
          patch(item.key, { status: 'done', sent: item.file.size });
          resolve();
        },
        onError: (err) => {
          patch(item.key, { status: 'failed', message: describeUploadError(err) });
          resolve();
        },
      });
      upload.start();
    });
  }

  async function startAll() {
    if (running || categoryId === '') return;
    setRunning(true);
    lastCategory.write(categoryId);
    for (const item of items) {
      if (item.status === 'waiting' || item.status === 'failed') await send(item);
    }
    setRunning(false);
    void invalidate('episodes');
  }

  const pending = items.filter((i) => i.status === 'waiting' || i.status === 'failed').length;
  const done = items.filter((i) => i.status === 'done').length;
  const finished = !running && items.length > 0 && pending === 0 && done > 0;

  return (
    <>
      <Link className="admin-back" to="/episodes">
        ← {mn.episodes.title}
      </Link>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <section className="admin-card admin-form" aria-label={t.title}>
        {categories.data && list.length === 0 ? (
          <Notice tone="warning">
            {mn.episodes.form.noCategories} <Link to="/categories">{mn.nav.categories}</Link>
          </Notice>
        ) : (
          <SelectField
            label={t.category}
            value={categoryId}
            onChange={setCategoryId}
            disabled={running}
            options={[
              ...(categoryId === '' ? [{ value: '', label: mn.episodes.form.pickCategory }] : []),
              ...list.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}

        {/* Big while the list is empty; one line to add more once there are files. */}
        <DropZone
          {...(items.length > 0 ? { className: 'admin-drop--compact' } : {})}
          label={t.choose}
          accept={ACCEPT}
          disabled={running}
          onFiles={add}
        >
          <Icon name="plus" size={items.length > 0 ? 'small' : 'regular'} />
          <strong>{t.drop}</strong>
          <span className="admin-drop__sub">{mn.episodes.workspace.fileFormats}</span>
        </DropZone>

        {items.length > 0 ? (
          <ul className="admin-bulk-list" aria-label={t.listLabel}>
            {items.map((item) => (
              <li key={item.key} className="admin-staged">
                <Icon
                  name={
                    item.status === 'invalid' ? 'alert' : item.kind === 'VIDEO' ? 'video' : 'audio'
                  }
                />
                <span className="admin-staged__text">
                  <strong>{item.file.name}</strong>
                  {item.status === 'uploading' ? (
                    <progress
                      max={item.file.size || 1}
                      value={item.sent}
                      aria-label={item.file.name}
                    />
                  ) : null}
                  <span
                    className={
                      item.status === 'failed' || item.status === 'invalid'
                        ? 'admin-hint admin-hint--error'
                        : 'admin-hint'
                    }
                  >
                    {formatBytes(item.file.size)} ·{' '}
                    {item.message ??
                      (item.status === 'uploading'
                        ? t.progress(Math.floor((item.sent / (item.file.size || 1)) * 100))
                        : t.status[item.status])}
                  </span>
                </span>
                {item.episodeId && (item.status === 'done' || item.status === 'failed') ? (
                  <Link to={`/episodes/${item.episodeId}`}>{t.open}</Link>
                ) : null}
                {!running && item.status !== 'done' && !item.episodeId ? (
                  <Button
                    variant="ghost"
                    onClick={() => setItems((all) => all.filter((i) => i.key !== item.key))}
                  >
                    {t.remove}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {finished ? (
          <Notice tone="success">
            {t.finished(done)} <Link to="/episodes?status=DRAFT">{t.toDrafts}</Link>
          </Notice>
        ) : null}

        {finished ? null : (
          <div>
            <Button
              loading={running}
              disabled={running || pending === 0 || categoryId === ''}
              onClick={() => void startAll()}
            >
              {running ? t.running : t.start(pending)}
            </Button>
          </div>
        )}
        {categoryId === '' && items.length > 0 ? (
          <p className="admin-hint">{t.needCategory}</p>
        ) : null}
      </section>

      <LeaveGuard uploading={running} unsaved={!running && pending > 0} />
    </>
  );
}
