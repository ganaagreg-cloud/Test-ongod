import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { mn } from '../i18n/mn';
import { ConfirmDialog } from './Modal';

/**
 * Holds the admin on the page while `uploading` or `unsaved` (ADR-0068): a link inside the admin
 * asks first; closing or reloading the tab gets the browser's own question.
 */
export function LeaveGuard({ uploading, unsaved }: { uploading: boolean; unsaved: boolean }) {
  const active = uploading || unsaved;
  // A replace is the page itself moving (a new draft gets its id), not the admin leaving.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      active && historyAction !== 'REPLACE' && currentLocation.pathname !== nextLocation.pathname,
  );

  // The dialog closes itself after "Гарах"; that close must not cancel the leaving.
  const leaving = useRef(false);

  useEffect(() => {
    if (!active) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [active]);

  const t = mn.episodes.leave;
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={uploading ? t.uploadingTitle : t.unsavedTitle}
      text={uploading ? t.uploadingText : t.unsavedText}
      confirmLabel={t.leave}
      tone="destructive"
      onClose={() => {
        if (!leaving.current) blocker.reset?.();
        leaving.current = false;
      }}
      onConfirm={async () => {
        leaving.current = true;
        blocker.proceed?.();
      }}
    />
  );
}
