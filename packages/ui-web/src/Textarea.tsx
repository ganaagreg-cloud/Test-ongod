import { useId, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Multi-line field with the same label, hint and error behaviour as <Input>. */
export function Textarea({ label, error, hint, id, className, rows = 3, ...rest }: TextareaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const messageId = `${fieldId}-message`;
  const message = error ?? hint;
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label className="ui-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        className="ui-field__input ui-field__input--multiline"
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...rest}
      />
      {message && (
        <p id={messageId} className={cx('ui-field__message', error && 'is-error')}>
          {message}
        </p>
      )}
    </div>
  );
}
