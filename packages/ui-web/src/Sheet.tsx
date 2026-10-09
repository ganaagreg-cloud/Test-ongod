import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * Bottom sheet on the native <dialog> element: the browser traps focus, closes on Esc, makes
 * the page behind inert and restores focus. Tapping the dimmed area closes it.
 */
export function Sheet({ open, onClose, title, closeLabel, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-sheet"
      aria-labelledby={titleId}
      onClose={() => open && onClose()}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="ui-sheet__panel">
        <span className="ui-sheet__handle" aria-hidden="true" />
        <div className="ui-sheet__header">
          <h2 id={titleId} className="ui-sheet__title">
            {title}
          </h2>
          <IconButton icon="close" label={closeLabel} onClick={onClose} />
        </div>
        <div className="ui-sheet__body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
