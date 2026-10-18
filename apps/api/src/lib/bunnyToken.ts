import { createHmac } from 'node:crypto';

/**
 * Bunny Pull Zone Token Authentication (current scheme, HMAC-SHA256).
 *
 * Docs:      https://bunny.net/docs/cdn/security/token-authentication/advanced
 * Reference: https://github.com/BunnyWay/BunnyCDN.TokenAuthentication (nodejs/token.js)
 * Facts and the checks behind them: docs/research/R-bunny-token-auth.md
 *
 *   token = "HS256-" + base64url(HMAC-SHA256(securityKey, signaturePath + expires + signingData))
 *
 * - signaturePath = the URL path, or `tokenPath` when set (a directory token: it covers every
 *   file under that prefix, which HLS video will need later).
 * - expires       = UNIX seconds, as a decimal string.
 * - signingData   = query parameters (plus `token_path` when set) sorted by key, as raw
 *                   `key=value` joined by `&`. `token` and `expires` are not part of it.
 * - base64url     = base64 with + -> -, / -> _ and the = padding removed.
 *
 * HLS video (ADR-0038) uses the path form: the token sits in the URL path
 * (`/bcdn_token=<token>&token_path=...&expires=<e>/<path>`), so the player's relative segment
 * URLs carry it too. The signature is the same; only where it is written differs.
 *
 * There is deliberately no IP parameter (ADR-0020): mobile clients change IP mid-playback.
 * With no IP the reference code adds nothing between `expires` and `signingData`.
 */

export interface BunnyTokenConfig {
  /** Pull zone hostname without scheme, e.g. "ongod-dev.b-cdn.net" (BUNNY_PULL_ZONE_HOST). */
  host: string;
  /** Token Authentication key of the pull zone (BUNNY_CDN_TOKEN_KEY). */
  tokenKey: string;
}

export interface SignUrlInput {
  /** Absolute path inside the zone, e.g. "/episodes/abc/audio.mp3". ASCII only. */
  path: string;
  expiresAt: Date;
  /** Directory scope, e.g. "/episodes/abc/". When set, the token is valid for every file under it. */
  tokenPath?: string;
  /** Extra query parameters; they are signed, so they cannot be changed afterwards. ASCII only. */
  query?: Record<string, string>;
  /**
   * Put the token in the path (Bunny's "directory" URL form, needed for HLS) instead of the
   * query string. Use together with `tokenPath`.
   */
  inPath?: boolean;
}

const PATH_ASCII = /^[\x21-\x7e]+$/;
// Query text is percent-encoded in the URL, so a space is fine there.
const QUERY_ASCII = /^[\x20-\x7e]*$/;
const RESERVED_PARAMS = new Set(['token', 'expires', 'token_path']);
const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

function assertQueryText(value: string, what: string) {
  if (!QUERY_ASCII.test(value)) throw new Error(`${what} must be printable ASCII`);
}

function assertPath(value: string, what: string) {
  if (!PATH_ASCII.test(value)) {
    throw new Error(`${what} must be printable ASCII without spaces`);
  }
  if (!value.startsWith('/')) throw new Error(`${what} must start with "/"`);
  if (/[?#]/.test(value)) throw new Error(`${what} must not contain "?" or "#"`);
}

const base64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createBunnySigner(cfg: BunnyTokenConfig) {
  if (!cfg.tokenKey) throw new Error('Bunny token key must not be empty');
  if (!HOST.test(cfg.host)) throw new Error('Bunny pull zone host must be a bare hostname');

  /**
   * Full signed URL: https://<host><path>?token=...[&token_path=...]&expires=...
   * or, with `inPath`, https://<host>/bcdn_token=...[&token_path=...]&expires=...<path>
   */
  function signUrl(input: SignUrlInput): string {
    assertPath(input.path, 'path');
    if (input.tokenPath !== undefined) assertPath(input.tokenPath, 'tokenPath');

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (key === '') throw new Error('query key must not be empty');
      assertQueryText(key, 'query key');
      assertQueryText(value, 'query value');
      if (RESERVED_PARAMS.has(key)) throw new Error(`query key "${key}" is reserved`);
      params[key] = value;
    }
    if (input.tokenPath !== undefined) params.token_path = input.tokenPath;

    const expires = String(Math.floor(input.expiresAt.getTime() / 1000));
    // The reference sorts with localeCompare; we do the same so both agree on every input.
    const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));

    // The path is signed exactly as it is sent, i.e. after URL normalisation (as in the reference).
    const pathname = new URL(`https://${cfg.host}${input.path}`).pathname;
    const signaturePath = input.tokenPath ?? pathname;
    const signingData = entries.map(([k, v]) => `${k}=${v}`).join('&');
    const urlData = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

    const digest = createHmac('sha256', cfg.tokenKey)
      .update(signaturePath)
      .update(expires)
      .update(signingData)
      .digest();
    const token = `HS256-${base64url(digest)}`;

    const tail = urlData ? `&${urlData}` : '';
    return input.inPath
      ? `https://${cfg.host}/bcdn_token=${token}${tail}&expires=${expires}${pathname}`
      : `https://${cfg.host}${pathname}?token=${token}${tail}&expires=${expires}`;
  }

  return { signUrl };
}

export type BunnySigner = ReturnType<typeof createBunnySigner>;
