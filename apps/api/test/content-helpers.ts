import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { testDb, testEnv, testMediaRuntime } from './helpers';
import { buildApp } from '../src/app';
import { createMediaJobs } from '../src/media/jobs';
import type { MediaRuntime, MediaStorage } from '../src/media/storage';
import { JobRegistry } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import pino from 'pino';

/** A small valid WAV file: `seconds` of silence (8 kHz, mono, 16 bit). */
export function wavFile(seconds = 2): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * 2 * seconds);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A real PNG of the given size (any aspect), made with sharp. */
export const pngImage = (width = 800, height = 500, color = '#1F3B2E') =>
  sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();

/** An app that is also listening on a free port (the tus client needs a real socket). */
export async function listeningApp(
  opts: { runtime?: MediaRuntime; env?: Parameters<typeof testEnv>[0] } = {},
) {
  const runtime = opts.runtime ?? testMediaRuntime();
  const app = await buildApp({ env: testEnv(opts.env), db: testDb, mediaRuntime: runtime });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { app, runtime, base: `http://127.0.0.1:${port}` };
}

const b64 = (s: string) => Buffer.from(s).toString('base64');

/** Minimal tus 1.0 client: what tus-js-client does, step by step. */
export function tusClient(base: string, token: string) {
  const headers = (extra: Record<string, string> = {}) => ({
    'tus-resumable': '1.0.0',
    authorization: `Bearer ${token}`,
    ...extra,
  });
  return {
    create: (length: number, meta: Record<string, string>) =>
      fetch(`${base}/v1/admin/uploads`, {
        method: 'POST',
        headers: headers({
          'upload-length': String(length),
          'upload-metadata': Object.entries(meta)
            .map(([k, v]) => `${k} ${b64(v)}`)
            .join(','),
        }),
      }),
    head: (location: string) => fetch(`${base}${location}`, { method: 'HEAD', headers: headers() }),
    patch: (location: string, offset: number, chunk: Buffer) =>
      fetch(`${base}${location}`, {
        method: 'PATCH',
        headers: headers({
          'content-type': 'application/offset+octet-stream',
          'upload-offset': String(offset),
        }),
        body: new Uint8Array(chunk),
      }),
    /** Whole upload in `chunkSize` pieces; returns the Location. */
    async upload(file: Buffer, meta: Record<string, string>, chunkSize = 16 * 1024) {
      const created = await this.create(file.length, meta);
      if (created.status !== 201) throw new Error(`create failed: ${created.status}`);
      const location = created.headers.get('location')!;
      for (let offset = 0; offset < file.length; offset += chunkSize) {
        const res = await this.patch(location, offset, file.subarray(offset, offset + chunkSize));
        if (res.status !== 204) throw new Error(`patch failed: ${res.status}`);
      }
      return location;
    },
  };
}

/** Runs the queued media jobs against `storage` (not the one in the app, so tests can swap it). */
export async function runMediaJobs(runtime: MediaRuntime, storage: MediaStorage = runtime.storage) {
  const registry = new JobRegistry().register(
    ...createMediaJobs({ db: testDb, storage, dirs: runtime.dirs }),
  );
  const worker = new JobWorker(testDb, registry, pino({ level: 'silent' }), { pollIntervalMs: 50 });
  return worker.drain(8000);
}

export type App = FastifyInstance;
