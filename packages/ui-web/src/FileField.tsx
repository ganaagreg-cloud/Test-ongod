import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

export interface FileFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'value'
> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Native file picker (works with the camera on phones) with the field's label, hint and error. */
export function FileField({ label, error, hint, id, className, ...rest }: FileFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const messageId = `${fieldId}-message`;
  const message = error ?? hint;
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label className="ui-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        type="file"
        className="ui-field__input ui-field__input--file"
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
