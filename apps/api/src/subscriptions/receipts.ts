import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export type ReceiptType = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/** The real type from the first bytes. The client's file name and Content-Type are never trusted. */
export function sniffImage(buf: Buffer): ReceiptType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

const MIME: Record<ReceiptType['ext'], string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export interface ReceiptStore {
  /** Writes the file under a random name and returns the key to keep in Subscription.proofImagePath. */
  save(data: Buffer, ext: ReceiptType['ext']): Promise<string>;
  read(key: string): Promise<{ data: Buffer; mime: string } | null>;
  remove(key: string): Promise<void>;
}

/**
 * Receipts live in a private folder on the server's disk (RECEIPTS_DIR), outside every static
 * folder, so nothing but the admin endpoint can read them. Keys are random UUIDs: no user input
 * ever reaches a file path.
 */
export function createReceiptStore(dir: string): ReceiptStore {
  const root = resolve(dir);
  const pathOf = (key: string) => {
    if (!KEY.test(key)) throw new Error('invalid receipt key');
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error('invalid receipt key');
    return path;
  };

  return {
    async save(data, ext) {
      const key = `${randomUUID()}.${ext}`;
      await mkdir(root, { recursive: true });
      await writeFile(pathOf(key), data, { flag: 'wx' });
      return key;
    },
    async read(key) {
      if (!KEY.test(key)) return null;
      try {
        return {
          data: await readFile(pathOf(key)),
          mime: MIME[key.slice(key.lastIndexOf('.') + 1) as ReceiptType['ext']],
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}
