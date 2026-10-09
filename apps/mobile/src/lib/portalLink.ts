/**
 * Address of a portal page, from the portal base URL setting (EXPO_PUBLIC_PORTAL_URL). Returns
 * `undefined` when the setting is empty or is not an http(s) address, so screens hide the link
 * instead of showing a dead one. The final domain is still open (docs/open-questions.md #9).
 */
export function portalLink(base: string | undefined, path: `/${string}`): string | undefined {
  const trimmed = base?.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return `${trimmed}${path}`;
  } catch {
    return undefined;
  }
}
