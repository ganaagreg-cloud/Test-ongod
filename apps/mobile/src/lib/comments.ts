import { COMMENT_MAX_LENGTH } from '@ongod/shared';

/** What the comment box may send: not empty after trimming, and not over the limit (SPEC L). */
export function canSendComment(text: string): boolean {
  const length = text.trim().length;
  return length > 0 && length <= COMMENT_MAX_LENGTH;
}

/** Characters left, shown only when the writer gets close to the limit. */
export function commentCharsLeft(text: string): number | null {
  const left = COMMENT_MAX_LENGTH - text.length;
  return left <= 100 ? left : null;
}
