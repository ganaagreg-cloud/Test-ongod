import type { FastifyInstance } from 'fastify';
import { slugSchema } from '@ongod/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { testDb } from './helpers';
import { call, makeAdmin, makeMember } from './admin-helpers';
import { makeCategory, makeEpisode, makeTag } from './catalog-helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const TAG_ROUTES: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, unknown?]> = [
  ['GET', '/v1/admin/tags'],
  ['POST', '/v1/admin/tags', { name: 'Тест' }],
  ['PATCH', '/v1/admin/tags/x', { name: 'Тест' }],
  ['DELETE', '/v1/admin/tags/x'],
];

describe('admin tags', () => {
  it('tags need an admin', async () => {
    for (const [method, url, body] of TAG_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const member = await makeMember(app);
    for (const [method, url, body] of TAG_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('create returns the tag with a slug', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', '/v1/admin/tags', admin.accessToken, {
      name: 'Сэтгэл зүй',
    });
    expect(res.statusCode).toBe(201);
    const { tag } = res.json();
    expect(tag.name).toBe('Сэтгэл зүй');
    expect(slugSchema.safeParse(tag.slug).success).toBe(true);
    expect(tag.slug).toBe('setgel-zui');
    expect(tag.episodeCount).toBe(0);
  });

  it('same name twice gives 409 TAG_TAKEN', async () => {
    const admin = await makeAdmin(app);
    await call(app, 'POST', '/v1/admin/tags', admin.accessToken, { name: 'Сэтгэл зүй' });
    const res = await call(app, 'POST', '/v1/admin/tags', admin.accessToken, {
      name: 'сэтгэл ЗҮЙ',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TAG_TAKEN');
  });

  it('a different name with the same slug gets a numbered slug', async () => {
    const admin = await makeAdmin(app);
    await makeTag({ name: 'Зүй', slug: 'zui' });
    const res = await call(app, 'POST', '/v1/admin/tags', admin.accessToken, { name: 'Зуй' });
    expect(res.statusCode).toBe(201);
    expect(res.json().tag.slug).toBe('zui-2');
  });

  it('lists tags with episode counts and renames one', async () => {
    const admin = await makeAdmin(app);
    const tag = await makeTag({ name: 'Нэг' });
    const category = await makeCategory();
    const episode = await makeEpisode(category.id);
    await testDb.episodeTag.create({ data: { episodeId: episode.id, tagId: tag.id } });
    const list = await call(app, 'GET', '/v1/admin/tags', admin.accessToken);
    expect(list.statusCode).toBe(200);
    expect(list.json().tags).toEqual([expect.objectContaining({ id: tag.id, episodeCount: 1 })]);
    const res = await call(app, 'PATCH', `/v1/admin/tags/${tag.id}`, admin.accessToken, {
      name: 'Хоёр',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag.name).toBe('Хоёр');
  });

  it('delete keeps the episodes', async () => {
    const admin = await makeAdmin(app);
    const tag = await makeTag();
    const category = await makeCategory();
    const episode = await makeEpisode(category.id);
    await testDb.episodeTag.create({ data: { episodeId: episode.id, tagId: tag.id } });

    const res = await call(app, 'DELETE', `/v1/admin/tags/${tag.id}`, admin.accessToken);
    expect(res.statusCode).toBe(204);
    expect(await testDb.episode.findUnique({ where: { id: episode.id } })).not.toBeNull();
    expect(await testDb.episodeTag.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: 'tag.delete' } })).toBe(1);
  });
});
