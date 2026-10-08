/**
 * Live check of Bunny storage + pull zone token authentication.
 * Run:  pnpm --filter @ongod/api bunny:smoke      (reads ../../.env; never prints secrets)
 *
 * Needs BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY, BUNNY_PULL_ZONE_HOST, BUNNY_CDN_TOKEN_KEY and,
 * unless the zone is in Frankfurt, BUNNY_STORAGE_REGION. Exit code 1 if any check fails.
 */
import { randomUUID } from 'node:crypto';
import { bunnyDeleteFile, bunnyPutFile, type BunnyStorageConfig } from '../src/lib/bunnyStorage';
import { createBunnySigner } from '../src/lib/bunnyToken';

const REGIONS = ['de', 'uk', 'ny', 'la', 'sg', 'se', 'br', 'jh', 'syd'];

const missing = [
  'BUNNY_STORAGE_ZONE',
  'BUNNY_STORAGE_API_KEY',
  'BUNNY_PULL_ZONE_HOST',
  'BUNNY_CDN_TOKEN_KEY',
].filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(', ')} (set them in .env)`);
  process.exit(1);
}
const region = process.env.BUNNY_STORAGE_REGION || 'de';
if (!REGIONS.includes(region)) {
  console.error(`BUNNY_STORAGE_REGION must be one of: ${REGIONS.join(', ')} (or empty)`);
  process.exit(1);
}
const host = process.env.BUNNY_PULL_ZONE_HOST!;
if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host)) {
  console.error('BUNNY_PULL_ZONE_HOST must be a hostname only, without https:// or a path');
  process.exit(1);
}

const storage: BunnyStorageConfig = {
  zone: process.env.BUNNY_STORAGE_ZONE!,
  apiKey: process.env.BUNNY_STORAGE_API_KEY!,
  region,
};
const signer = createBunnySigner({ host, tokenKey: process.env.BUNNY_CDN_TOKEN_KEY! });

/** ~4 KB of valid-looking MPEG-1 Layer III frames (128 kbps, 44.1 kHz, silence). */
function testMp3(): Buffer {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat(Array.from({ length: 10 }, () => frame));
}

const pathA = `/smoke/${randomUUID()}.mp3`;
const pathB = `/smoke/${randomUUID()}.mp3`;
const mp3 = testMp3();
const HOUR = 3_600_000;

interface Row {
  step: string;
  check: string;
  expected: string;
  got: string;
  pass: boolean;
}
const rows: Row[] = [];
const record = (step: string, check: string, expected: string, got: string, pass: boolean) =>
  rows.push({ step, check, expected, got, pass });

/** Never throws and never follows redirects; a network error shows as "error". */
async function get(url: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const body = Buffer.from(await res.arrayBuffer());
    return { status: String(res.status), res, bytes: body.length };
  } catch {
    return { status: 'error', res: undefined, bytes: 0 };
  }
}

async function expectStatus(
  step: string,
  check: string,
  expected: string,
  url: string,
  headers?: Record<string, string>,
  retryOn404 = false,
) {
  let r = await get(url, headers);
  // A just-uploaded file can take a moment to show up behind the pull zone.
  for (let i = 0; retryOn404 && r.status === '404' && i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    r = await get(url, headers);
  }
  record(step, check, expected, r.status, r.status === expected);
  return r;
}

async function run() {
  try {
    await bunnyPutFile(storage, pathA, mp3, 'audio/mpeg');
    await bunnyPutFile(storage, pathB, mp3, 'audio/mpeg');
    record('a', 'PUT test MP3 to storage zone', '201', '201', true);
  } catch (err) {
    const got = err instanceof Error ? err.message : 'error';
    record('a', 'PUT test MP3 to storage zone', '201', got.replace(/^Bunny storage /, ''), false);
    return; // nothing to check without the files
  }

  const valid = signer.signUrl({ path: pathA, expiresAt: new Date(Date.now() + HOUR) });

  const full = await expectStatus('b', 'signed URL', '200', valid, undefined, true);
  if (full.status === '200') {
    record(
      'b',
      '  body is the uploaded file',
      String(mp3.length),
      String(full.bytes),
      full.bytes === mp3.length,
    );
  }

  const ranged = await expectStatus('c', 'signed URL + Range bytes=0-1023', '206', valid, {
    Range: 'bytes=0-1023',
  });
  if (ranged.status === '206') {
    const range = ranged.res?.headers.get('content-range') ?? '(none)';
    record(
      'c',
      '  returns exactly 1024 bytes',
      '1024',
      String(ranged.bytes),
      ranged.bytes === 1024,
    );
    record(
      'c',
      '  Content-Range header',
      `bytes 0-1023/${mp3.length}`,
      range,
      range === `bytes 0-1023/${mp3.length}`,
    );
  }

  await expectStatus('extra', 'no token at all', '403', `https://${host}${pathA}`);

  const u = new URL(valid);
  const token = u.searchParams.get('token')!;
  const last = token.at(-1)!;
  u.searchParams.set('token', token.slice(0, -1) + (last === 'A' ? 'B' : 'A'));
  await expectStatus('d', 'token changed by one character', '403', u.toString());

  const expired = signer.signUrl({ path: pathA, expiresAt: new Date(Date.now() - HOUR) });
  await expectStatus('e', 'expires in the past (correctly signed)', '403', expired);

  const other = new URL(valid);
  other.pathname = pathB; // file B exists, but the token was signed for file A
  await expectStatus('f', 'valid token on a different file', '403', other.toString());
}

async function cleanup() {
  for (const path of [pathA, pathB]) {
    try {
      await bunnyDeleteFile(storage, path);
    } catch (err) {
      const got = err instanceof Error ? err.message.replace(/^Bunny storage /, '') : 'error';
      record('g', `DELETE ${path}`, '200', got, false);
      return;
    }
  }
  record('g', 'DELETE both test files', '200', '200', true);
}

console.log(`Bunny smoke test: pull zone ${host}, storage zone ${storage.zone} (${region})\n`);
try {
  await run();
} finally {
  await cleanup();
}

const w = (s: string, n: number) => s.padEnd(n);
console.log(`${w('STEP', 6)}${w('RESULT', 7)}${w('CHECK', 42)}${w('EXPECTED', 22)}GOT`);
for (const r of rows) {
  console.log(
    `${w(r.step, 6)}${w(r.pass ? 'PASS' : 'FAIL', 7)}${w(r.check, 42)}${w(r.expected, 22)}${r.got}`,
  );
}
const failed = rows.filter((r) => !r.pass).length;
console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${rows.length} checks)`);
process.exit(failed === 0 ? 0 : 1);
