/**
 * The filter for objectionable posts (Apple Guideline 1.2, ADR-0061): links (the usual spam) and
 * the owner's word list. A match refuses the comment; nothing is stored.
 */
const LINK =
  /(https?:\/\/|www\.|[\p{L}\p{N}-]+\.(?:com|net|org|mn|io|me|ru|cn|xyz|info|biz|co|ly|app|link|site|online|top)\b)/iu;

export function isRejected(body: string, bannedWords: readonly string[]): boolean {
  if (LINK.test(body)) return true;
  const text = body.toLocaleLowerCase('mn');
  return bannedWords.some((w) => w !== '' && text.includes(w.toLocaleLowerCase('mn')));
}
