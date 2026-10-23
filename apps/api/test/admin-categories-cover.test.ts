import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { call, makeAdmin, makeMember, multipart } from './admin-helpers';
import { makeCategory } from './catalog-helpers';
import { listeningApp, pngImage, runMediaJobs, type App } from './content-helpers';
import type { MediaRuntime } from '../src/media/storage';
import { testDb } from './helpers';

let app: App;
let runtime: MediaRuntime;
let adminToken: string;
let categoryId: string;

beforeEach(async () => {
  ({ app, runtime } = await listeningApp());
  adminToken = (await makeAdmin(app)).accessToken;
  categoryId = (await makeCategory()).id;
});
afterEach(async () => {
  await app.close();
});

const upload = async (
  id: string,
  token: string | undefined,
  image: Buffer,
  type = 'image/png',
  field = 'cover',
) => {
  const { payload, headers } = await multipart({}, { name: 'c.png', data: image, type, field });
  return app.inject({
    method: 'POST',
    url: `/v1/admin/categories/${id}/cover`,
    payload,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
};
const coverPath = async () =>
  (await testDb.category.findUniqueOrThrow({ where: { id: categoryId } })).coverPath;
const coverJobs = () => testDb.job.count({ where: { type: 'media.category-cover-upload' } });

describe('category cover access', () => {
  it('needs an admin: anonymous 401, member 403, unknown category 404', async () => {
    const image = await pngImage(1200, 700);
    expect((await upload(categoryId, undefined, image)).statusCode).toBe(401);
    const member = await makeMember(app);
    expect((await upload(categoryId, member.accessToken, image)).statusCode).toBe(403);
    const missing = await upload('nope', adminToken, image);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
    expect(await coverJobs()).toBe(0);
  });

  it('refuses a non-image (400 COVER_INVALID), a missing file and more than 10 MB (413)', async () => {
    const bad = await upload(categoryId, adminToken, Buffer.from('plain text'));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('COVER_INVALID');

    const none = await call(app, 'POST', `/v1/admin/categories/${categoryId}/cover`, adminToken);
    expect(none.statusCode).toBe(400);

    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(10 * 1024 * 1024 + 1),
    ]);
    const huge = await upload(categoryId, adminToken, big);
    expect(huge.statusCode).toBe(413);
    expect(huge.json().error.code).toBe('COVER_TOO_LARGE');
    expect(await coverJobs()).toBe(0);
  });
});

describe('category cover upload', () => {
  it('queues a job (202), the job stores both sizes and the DTO then has a coverUrl', async () => {
    const before = await call(app, 'GET', '/v1/admin/categories', adminToken);
    expect(before.json().categories[0].coverUrl).toBeNull();

    const res = await upload(categoryId, adminToken, await pngImage(1200, 700));
    expect(res.statusCode).toBe(202);
    expect(res.json().category.coverUrl).toBeNull();
    expect(await coverJobs()).toBe(1);
    expect(await coverPath()).toBeNull();
    expect(
      await testDb.auditLog.count({ where: { action: 'category.cover', targetId: categoryId } }),
    ).toBe(1);

    await runMediaJobs(runtime);
    const path = (await coverPath())!;
    expect(path).toMatch(new RegExp(`^covers/category/${categoryId}/[0-9a-f-]{36}\\.webp$`));
    const full = await sharp(join(runtime.dirs.published, path)).metadata();
    expect(full).toMatchObject({ format: 'webp', width: 1280, height: 720 });
    const thumb = await sharp(
      join(runtime.dirs.published, path.replace('.webp', '-400.webp')),
    ).metadata();
    expect(thumb).toMatchObject({ width: 640, height: 360 });

    const after = await call(app, 'GET', '/v1/admin/categories', adminToken);
    expect(after.json().categories[0].coverUrl).toEqual(expect.any(String));
  });

  it('a new cover replaces the old one and the old files are deleted', async () => {
    await upload(categoryId, adminToken, await pngImage(500, 500));
    await runMediaJobs(runtime);
    const first = (await coverPath())!;
    expect(existsSync(join(runtime.dirs.published, first))).toBe(true);

    await upload(categoryId, adminToken, await pngImage(600, 600, '#D4AF6A'));
    await runMediaJobs(runtime);
    const second = (await coverPath())!;
    expect(second).not.toBe(first);
    expect(existsSync(join(runtime.dirs.published, first))).toBe(false);
    expect(existsSync(join(runtime.dirs.published, first.replace('.webp', '-400.webp')))).toBe(
      false,
    );
    expect(existsSync(join(runtime.dirs.published, second))).toBe(true);
  });

  it('deleting the category queues deletion of both stored sizes', async () => {
    await upload(categoryId, adminToken, await pngImage(500, 500));
    await runMediaJobs(runtime);
    const path = (await coverPath())!;
    const thumb = path.replace('.webp', '-400.webp');

    const res = await call(app, 'DELETE', `/v1/admin/categories/${categoryId}`, adminToken);
    expect(res.statusCode).toBe(204);
    const jobs = await testDb.job.findMany({ where: { type: 'media.delete-files' } });
    expect(jobs).toHaveLength(1);
    const { paths } = JSON.parse(jobs[0]!.payload) as { paths: string[] };
    expect([...paths].sort()).toEqual([path, thumb].sort());

    await runMediaJobs(runtime);
    expect(existsSync(join(runtime.dirs.published, path))).toBe(false);
    expect(existsSync(join(runtime.dirs.published, thumb))).toBe(false);
  });

  it('deleting a category without a cover queues no deletion', async () => {
    const res = await call(app, 'DELETE', `/v1/admin/categories/${categoryId}`, adminToken);
    expect(res.statusCode).toBe(204);
    expect(await testDb.job.count({ where: { type: 'media.delete-files' } })).toBe(0);
  });
});
