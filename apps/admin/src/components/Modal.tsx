import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, IconButton, Notice, Textarea } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { mn } from '../i18n/mn';

/** True while any modal dialog is open; keyboard shortcuts stay quiet then. */
export const isModalOpen = () => document.querySelector('dialog[open]') !== null;

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A centered dialog on the native <dialog> element: the browser traps focus, closes on Esc, makes
 * the page behind inert and puts focus back where it was. (ui-web's <Sheet> is the bottom sheet
 * for phones; the admin is a desktop tool and wants a normal dialog.)
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
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
      className="admin-modal"
      aria-labelledby={titleId}
      onClose={() => open && onClose()}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="admin-modal__panel">
        <div className="admin-modal__header">
          <h2 id={titleId} className="admin-modal__title">
            {title}
          </h2>
          <IconButton icon="close" label={mn.common.close} onClick={onClose} />
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}

export const errorText = (err: unknown): string =>
  err instanceof ApiError ? err.message : mn.common.errorGeneric;

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  text?: string | undefined;
  confirmLabel: string;
  /** `destructive` for anything that removes or refuses something. */
  tone?: 'primary' | 'destructive';
  /** Asks for a required free-text reason and passes it to `onConfirm`. */
  reason?: { label: string; hint?: string } | undefined;
  /** Extra fields (e.g. a checkbox) rendered above the buttons. */
  children?: ReactNode;
  /** Resolve to close the dialog; throw to keep it open (the error is shown inside). */
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}

/** Every destructive action in the admin goes through this (CLAUDE.md: confirm dialog). */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  tone = 'primary',
  reason,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <ConfirmBody
        text={text}
        confirmLabel={confirmLabel}
        tone={tone}
        reason={reason}
        onConfirm={onConfirm}
        onClose={onClose}
      >
        {children}
      </ConfirmBody>
    </Modal>
  );
}

function ConfirmBody({
  text,
  confirmLabel,
  tone,
  reason,
  children,
  onConfirm,
  onClose,
}: Omit<ConfirmDialogProps, 'open' | 'title'>) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const trimmed = value.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || (reason && trimmed === '')) return;
    setPending(true);
    setError(undefined);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-modal__body" onSubmit={submit} noValidate>
      {text ? <p className="admin-modal__text">{text}</p> : null}
      {reason ? (
        <Textarea
          label={reason.label}
          hint={reason.hint}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={500}
          required
          autoFocus
        />
      ) : null}
      {children}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {mn.confirm.cancel}
        </Button>
        <Button
          type="submit"
          variant={tone === 'destructive' ? 'destructive' : 'primary'}
          loading={pending}
          disabled={reason !== undefined && trimmed === ''}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
