import { Notice } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { mn } from '../i18n/mn';

/** The message of a failed request. The API's own messages are already Mongolian. */
export const errorText = (error: unknown): string =>
  error instanceof ApiError ? error.message : mn.common.errorGeneric;

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return <Notice tone="danger">{errorText(error)}</Notice>;
}
