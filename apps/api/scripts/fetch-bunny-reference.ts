/**
 * Downloads Bunny's reference token signer for the oracle test (test/bunny-token.test.ts).
 *
 * The upstream repo declares no license, so the file is NOT vendored: it is fetched at a pinned
 * commit, checked against a pinned SHA-256, and saved to a gitignored path.
 *
 *   pnpm --filter @ongod/api bunny:reference            (always downloads)
 *   tsx scripts/fetch-bunny-reference.ts --if-missing   (used by `pnpm test`)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '919fe7d6c17c9094565875e914adab957e922f10';
const SHA256 = '41828d0b09cfeb438e5e1d64c7d09cfac50a26e7f6666e9ba6737af475ba5492';
const URL_ = `https://raw.githubusercontent.com/BunnyWay/BunnyCDN.TokenAuthentication/${COMMIT}/nodejs/token.js`;

// .cjs because apps/api is "type": "module" and the reference uses require/module.exports.
const REFERENCE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures/bunny-reference/token.cjs',
);

if (process.argv.includes('--if-missing') && existsSync(REFERENCE_PATH)) process.exit(0);

const res = await fetch(URL_);
if (!res.ok) {
  console.error(`Could not download the Bunny reference (HTTP ${res.status}).`);
  process.exit(1);
}
const body = Buffer.from(await res.arrayBuffer());
const actual = createHash('sha256').update(body).digest('hex');
if (actual !== SHA256) {
  console.error(`Bunny reference hash mismatch.\n  expected ${SHA256}\n  actual   ${actual}`);
  process.exit(1);
}
mkdirSync(dirname(REFERENCE_PATH), { recursive: true });
writeFileSync(REFERENCE_PATH, body);
console.log(`Saved Bunny reference token.js (${COMMIT.slice(0, 7)}, sha256 verified).`);
