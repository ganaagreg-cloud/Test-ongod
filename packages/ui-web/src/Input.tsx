import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Shown below the field in the danger color; also marks the field invalid. */
  error?: string | undefined;
  hint?: string | undefined;
}

export function Input({ label, error, hint, id, className, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="ui-field__input"
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
