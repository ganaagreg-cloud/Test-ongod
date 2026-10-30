import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { call, makeAdmin, makeMember } from './admin-helpers';
import { makeCategory, makeEpisode, setAccess } from './catalog-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await authApp({ COMMENT_BANNED_WORDS: 'badword, Муу Үг' });
});
afterEach(async () => {
  await app.close();
});

const DAY = 86_400_000;
const names = (firstName: string, lastName: string) => ({ names: { firstName, lastName } });

/** A signed-in member with access (or without) and a published episode. */
async function setup(opts: { free?: boolean } = {}) {
  const category = await makeCategory();
  const episode = await makeEpisode(category.id, { isFree: opts.free ?? false });
  const member = await makeMember(app, 'bat@example.com', names('Бат', 'Эрдэнэ'));
  await setAccess(member.userId, new Date(Date.now() + 30 * DAY));
  return { episode, member };
}
const post = (episodeId: string, token: string | undefined, body: unknown) =>
  call(app, 'POST', `/v1/episodes/${episodeId}/comments`, token, { body });
const list = (episodeId: string, token: string | undefined, query = '') =>
  call(app, 'GET', `/v1/episodes/${episodeId}/comments${query}`, token);
const other = (email: string, first = 'Дорж', last = 'Бат') =>
  makeMember(app, email, names(first, last)).then(async (m) => {
    await setAccess(m.userId, new Date(Date.now() + 30 * DAY));
    return m;
  });

describe('reading comments (SPEC L)', () => {
  it('needs a login; the author shows as first name and a last-name initial, never a username or email', async () => {
    const { episode, member } = await setup();
    expect((await list(episode.id, undefined)).statusCode).toBe(401);
    expect((await post(episode.id, member.accessToken, 'Сайхан анги байлаа')).statusCode).toBe(201);
    const res = await list(episode.id, member.accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.canComment).toBe(true);
    expect(body.items).toMatchObject([
      { authorName: 'Бат Э.', body: 'Сайхан анги байлаа', mine: true, edited: false },
    ]);
    expect(JSON.stringify(body)).not.toContain('@example.com');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('a member without access can read, cannot post, and canComment is false', async () => {
    const { episode, member } = await setup();
    await post(episode.id, member.accessToken, 'Нэг');
    const reader = await makeMember(app, 'reader@example.com');
    const res = await list(episode.id, reader.accessToken);
    expect(res.json()).toMatchObject({ canComment: false, items: [{ mine: false }] });
    const refused = await post(episode.id, reader.accessToken, 'Би бичье');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('COMMENT_FORBIDDEN');
    expect(await testDb.comment.count()).toBe(1);
  });

  it('on a free episode a member without access may post', async () => {
    const { episode } = await setup({ free: true });
    const reader = await makeMember(app, 'reader@example.com');
    expect((await post(episode.id, reader.accessToken, 'Үнэгүй анги сайн')).statusCode).toBe(201);
  });

  it('an unpublished or unknown episode has no comments (404), and expired access cannot post', async () => {
    const category = await makeCategory();
    const draft = await makeEpisode(category.id, { status: 'DRAFT' });
    const { episode, member } = await setup();
    expect((await list(draft.id, member.accessToken)).statusCode).toBe(404);
    expect((await post(draft.id, member.accessToken, 'x')).statusCode).toBe(404);
    expect((await list('nope', member.accessToken)).statusCode).toBe(404);
    await setAccess(member.userId, new Date(Date.now() - 1000));
    expect((await post(episode.id, member.accessToken, 'Дууссан')).statusCode).toBe(403);
  });

  it('pages newest first with a cursor', async () => {
    const { episode, member } = await setup();
    for (let i = 1; i <= 3; i++) {
      await testDb.comment.create({
        data: {
          episodeId: episode.id,
          authorId: member.userId,
          body: `Сэтгэгдэл ${i}`,
          createdAt: new Date(Date.now() - (10 - i) * 1000),
        },
      });
    }
    const first = (await list(episode.id, member.accessToken, '?limit=2')).json();
    expect(first.items.map((c: { body: string }) => c.body)).toEqual([
      'Сэтгэгдэл 3',
      'Сэтгэгдэл 2',
    ]);
    expect(first.nextCursor).toBeTruthy();
    const second = (
      await list(episode.id, member.accessToken, `?limit=2&cursor=${first.nextCursor}`)
    ).json();
    expect(second.items.map((c: { body: string }) => c.body)).toEqual(['Сэтгэгдэл 1']);
    expect(second.nextCursor).toBeNull();
    expect([first.total, second.total]).toEqual([3, 3]);
  });
});

describe('posting: filter and limits', () => {
  it('refuses links and banned words (ignoring case), stores nothing', async () => {
    const { episode, member } = await setup();
    for (const body of [
      'Үз https://spam.example/x',
      'www.spam.mn',
      'манай сайт spam.com руу ор',
      'энэ BADWORD байна',
      'ямар муу үг вэ',
    ]) {
      const res = await post(episode.id, member.accessToken, body);
      expect(res.statusCode, body).toBe(422);
      expect(res.json().error.code).toBe('COMMENT_REJECTED');
    }
    expect(await testDb.comment.count()).toBe(0);
    expect(
      (await post(episode.id, member.accessToken, 'Энгийн сайхан сэтгэгдэл. Баярлалаа!'))
        .statusCode,
    ).toBe(201);
  });

  it('validates the body: empty, only spaces and over 1000 characters are 400', async () => {
    const { episode, member } = await setup();
    for (const body of ['', '   ', 'a'.repeat(1001)]) {
      expect((await post(episode.id, member.accessToken, body)).statusCode).toBe(400);
    }
    expect((await post(episode.id, member.accessToken, 'a'.repeat(1000))).statusCode).toBe(201);
    expect(
      (await call(app, 'POST', `/v1/episodes/${episode.id}/comments`, member.accessToken, {}))
        .statusCode,
    ).toBe(400);
  });

  it('at most 5 a minute per user', async () => {
    const { episode, member } = await setup();
    for (let i = 0; i < 5; i++) {
      expect((await post(episode.id, member.accessToken, `Сэтгэгдэл ${i}`)).statusCode).toBe(201);
    }
    const sixth = await post(episode.id, member.accessToken, 'Зургаа');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('RATE_LIMITED');
  });

  it('posts sent at the same moment cannot pass the limit together (audit F05)', async () => {
    const { episode, member } = await setup();
    for (let i = 0; i < 4; i++) await post(episode.id, member.accessToken, `Өмнөх ${i}`);
    const burst = await Promise.all(
      [1, 2, 3, 4].map((i) => post(episode.id, member.accessToken, `Зэрэг ${i}`)),
    );
    expect(burst.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(await testDb.comment.count({ where: { authorId: member.userId } })).toBe(5);
  });

  it('a muted user cannot post or edit, and is told so', async () => {
    const { episode, member } = await setup();
    const created = (await post(episode.id, member.accessToken, 'Өмнө бичсэн')).json().comment;
    await testDb.user.update({
      where: { id: member.userId },
      data: { commentMutedAt: new Date() },
    });
    expect((await post(episode.id, member.accessToken, 'Дахин')).statusCode).toBe(403);
    expect(
      (
        await call(app, 'PATCH', `/v1/comments/${created.id}`, member.accessToken, {
          body: 'Засав',
        })
      ).statusCode,
    ).toBe(403);
    expect((await list(episode.id, member.accessToken)).json().canComment).toBe(false);
  });
});

describe('own comments', () => {
  it('can be edited (marked edited) and deleted, only by the author', async () => {
    const { episode, member } = await setup();
    const friend = await other('friend@example.com');
    const c = (await post(episode.id, member.accessToken, 'Анхны')).json().comment;
    const edited = await call(app, 'PATCH', `/v1/comments/${c.id}`, member.accessToken, {
      body: 'Засав',
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().comment).toMatchObject({ body: 'Засав', edited: true });
    // The filter applies to edits too.
    expect(
      (await call(app, 'PATCH', `/v1/comments/${c.id}`, member.accessToken, { body: 'badword' }))
        .statusCode,
    ).toBe(422);

    expect(
      (await call(app, 'PATCH', `/v1/comments/${c.id}`, friend.accessToken, { body: 'Хулгай' }))
        .statusCode,
    ).toBe(404);
    expect((await call(app, 'DELETE', `/v1/comments/${c.id}`, friend.accessToken)).statusCode).toBe(
      404,
    );
    expect((await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).body).toBe('Засав');

    expect((await call(app, 'DELETE', `/v1/comments/${c.id}`, member.accessToken)).statusCode).toBe(
      204,
    );
    expect((await call(app, 'DELETE', `/v1/comments/${c.id}`, member.accessToken)).statusCode).toBe(
      204,
    );
    expect((await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      'DELETED',
    );
    expect((await list(episode.id, member.accessToken)).json().items).toEqual([]);
    expect(
      (await call(app, 'PATCH', `/v1/comments/${c.id}`, member.accessToken, { body: 'Дахин' }))
        .statusCode,
    ).toBe(404);
  });

  it('a comment an admin hid cannot be edited back into view by its author', async () => {
    const { episode, member } = await setup();
    const c = (await post(episode.id, member.accessToken, 'Муухай')).json().comment;
    await testDb.comment.update({
      where: { id: c.id },
      data: { status: 'HIDDEN', hiddenBy: 'admin' },
    });
    expect(
      (await call(app, 'PATCH', `/v1/comments/${c.id}`, member.accessToken, { body: 'Цэвэр' }))
        .statusCode,
    ).toBe(404);
    expect((await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('HIDDEN');
  });
});

describe('reports (Apple 1.2: report and timely action)', () => {
  it('reporting needs a login, not your own comment; repeating it counts once', async () => {
    const { episode, member } = await setup();
    const friend = await other('friend@example.com');
    const c = (await post(episode.id, member.accessToken, 'Сэжигтэй')).json().comment;
    const url = `/v1/comments/${c.id}/report`;
    expect((await call(app, 'POST', url, undefined, { reason: 'SPAM' })).statusCode).toBe(401);
    expect((await call(app, 'POST', url, member.accessToken, { reason: 'SPAM' })).statusCode).toBe(
      403,
    );
    expect((await call(app, 'POST', url, friend.accessToken, { reason: 'NOPE' })).statusCode).toBe(
      400,
    );
    expect((await call(app, 'POST', url, friend.accessToken, { reason: 'SPAM' })).statusCode).toBe(
      204,
    );
    expect((await call(app, 'POST', url, friend.accessToken, { reason: 'ABUSE' })).statusCode).toBe(
      204,
    );
    expect(await testDb.commentReport.count()).toBe(1);
    expect((await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      'VISIBLE',
    );
    expect(
      (await call(app, 'POST', '/v1/comments/nope/report', friend.accessToken, { reason: 'SPAM' }))
        .statusCode,
    ).toBe(404);
  });

  it('three reports at the same moment still hide the comment (re-audit)', async () => {
    const { episode, member } = await setup();
    const reporters = [];
    for (const email of ['p@example.com', 'q@example.com', 'r@example.com']) {
      reporters.push(await other(email));
    }
    for (let round = 0; round < 5; round++) {
      const c = (await post(episode.id, member.accessToken, `Жигшүүрт ${round}`)).json().comment;
      const codes = await Promise.all(
        reporters.map((m) =>
          call(app, 'POST', `/v1/comments/${c.id}/report`, m.accessToken, { reason: 'ABUSE' }).then(
            (r) => r.statusCode,
          ),
        ),
      );
      expect(codes.every((code) => code < 300)).toBe(true);
      const row = await testDb.comment.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ status: 'HIDDEN', hiddenBy: 'reports' });
    }
  });

  it('the third report from three different people hides the comment from everyone', async () => {
    const { episode, member } = await setup();
    const c = (await post(episode.id, member.accessToken, 'Жигшүүрт')).json().comment;
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      const m = await other(email);
      await call(app, 'POST', `/v1/comments/${c.id}/report`, m.accessToken, { reason: 'ABUSE' });
    }
    const row = await testDb.comment.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ status: 'HIDDEN', hiddenBy: 'reports' });
    expect((await list(episode.id, member.accessToken)).json().items).toEqual([]);
    // A hidden comment cannot be reported again.
    const d = await other('d@example.com');
    expect(
      (await call(app, 'POST', `/v1/comments/${c.id}/report`, d.accessToken, { reason: 'SPAM' }))
        .statusCode,
    ).toBe(404);
    // It stays in the admin's reported queue until someone looks at it (audit F06) ...
    const admin = await makeAdmin(app);
    const queue = () =>
      call(app, 'GET', '/v1/admin/comments', admin.accessToken).then((r) => r.json());
    expect((await queue()).items.map((x: { id: string }) => x.id)).toEqual([c.id]);
    // ... and "keep hidden" takes it out, still hidden.
    const keep = await call(app, 'POST', `/v1/admin/comments/${c.id}/hide`, admin.accessToken);
    expect(keep.statusCode).toBeLessThan(300);
    expect(await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: 'HIDDEN',
      hiddenBy: 'admin',
    });
    expect((await queue()).total).toBe(0);
  });
});

describe('blocking', () => {
  it('hides the blocked author for the blocker only, can be listed and undone', async () => {
    const { episode, member } = await setup();
    const friend = await other('friend@example.com', 'Сараа', 'Дорж');
    const c = (await post(episode.id, member.accessToken, 'Миний үг')).json().comment;
    await post(episode.id, friend.accessToken, 'Найзын үг');

    const url = `/v1/comments/${c.id}/block`;
    expect((await call(app, 'POST', url, undefined)).statusCode).toBe(401);
    expect((await call(app, 'POST', url, member.accessToken)).statusCode).toBe(403); // yourself
    expect((await call(app, 'POST', url, friend.accessToken)).statusCode).toBe(204);
    expect((await call(app, 'POST', url, friend.accessToken)).statusCode).toBe(204);

    const seenByFriend = (await list(episode.id, friend.accessToken)).json().items;
    expect(seenByFriend.map((x: { body: string }) => x.body)).toEqual(['Найзын үг']);
    const seenByAuthor = (await list(episode.id, member.accessToken)).json().items;
    expect(seenByAuthor.map((x: { body: string }) => x.body)).toEqual(['Найзын үг', 'Миний үг']);

    const blocks = await call(app, 'GET', '/v1/me/blocks', friend.accessToken);
    expect(blocks.json().users).toEqual([{ id: member.userId, name: 'Бат Э.' }]);
    expect((await call(app, 'GET', '/v1/me/blocks', member.accessToken)).json().users).toEqual([]);

    expect(
      (await call(app, 'DELETE', `/v1/me/blocks/${member.userId}`, friend.accessToken)).statusCode,
    ).toBe(204);
    expect((await list(episode.id, friend.accessToken)).json().items).toHaveLength(2);
  });

  it('the total drops by one for the viewer who blocked an author, not for others', async () => {
    const { episode, member } = await setup();
    const friend = await other('friend2@example.com', 'Сараа', 'Дорж');
    const c = (await post(episode.id, member.accessToken, 'Нэг')).json().comment;
    await post(episode.id, friend.accessToken, 'Хоёр');
    expect((await list(episode.id, friend.accessToken)).json().total).toBe(2);
    await call(app, 'POST', `/v1/comments/${c.id}/block`, friend.accessToken);
    expect((await list(episode.id, friend.accessToken)).json().total).toBe(1);
    expect((await list(episode.id, member.accessToken)).json().total).toBe(2);
  });
});

describe('an author who deleted their account', () => {
  it('shows as a deleted user', async () => {
    const { episode, member } = await setup();
    await post(episode.id, member.accessToken, 'Сайн байна');
    await testDb.user.update({ where: { id: member.userId }, data: { status: 'DELETED' } });
    const friend = await other('friend@example.com');
    const items = (await list(episode.id, friend.accessToken)).json().items;
    expect(items[0].authorName).toBe('Устгагдсан хэрэглэгч');
  });
});

describe('admin moderation', () => {
  const ROUTES: Array<['GET' | 'POST' | 'DELETE', string]> = [
    ['GET', '/v1/admin/comments'],
    ['POST', '/v1/admin/comments/x/hide'],
    ['POST', '/v1/admin/comments/x/restore'],
    ['POST', '/v1/admin/comments/x/dismiss'],
    ['POST', '/v1/admin/comments/x/delete'],
    ['POST', '/v1/admin/users/x/comment-mute'],
    ['DELETE', '/v1/admin/users/x/comment-mute'],
  ];

  it('needs an admin: 401 without a session, 403 for a member', async () => {
    const { member } = await setup();
    for (const [method, url] of ROUTES) {
      expect((await call(app, method, url)).statusCode, url).toBe(401);
      expect((await call(app, method, url, member.accessToken)).statusCode, url).toBe(403);
    }
  });

  it('lists reported comments first (most reports), and by status; searches', async () => {
    const { episode, member } = await setup();
    const a = (await post(episode.id, member.accessToken, 'Нэг тайлан')).json().comment;
    const b = (await post(episode.id, member.accessToken, 'Хоёр тайлан')).json().comment;
    await post(episode.id, member.accessToken, 'Тайлангүй');
    const r1 = await other('r1@example.com');
    const r2 = await other('r2@example.com');
    await call(app, 'POST', `/v1/comments/${a.id}/report`, r1.accessToken, { reason: 'SPAM' });
    await call(app, 'POST', `/v1/comments/${b.id}/report`, r1.accessToken, { reason: 'ABUSE' });
    await call(app, 'POST', `/v1/comments/${b.id}/report`, r2.accessToken, { reason: 'SPAM' });

    const admin = await makeAdmin(app);
    const reported = (await call(app, 'GET', '/v1/admin/comments', admin.accessToken)).json();
    expect(reported.total).toBe(2);
    expect(reported.items.map((c: { id: string }) => c.id)).toEqual([b.id, a.id]);
    expect(reported.items[0]).toMatchObject({
      reportCount: 2,
      author: { username: expect.any(String), name: 'Эрдэнэ Бат', muted: false },
      episode: { id: episode.id },
    });
    expect(reported.items[0].reasons.sort()).toEqual(['ABUSE', 'SPAM']);
    const all = (
      await call(app, 'GET', '/v1/admin/comments?filter=VISIBLE', admin.accessToken)
    ).json();
    expect(all.total).toBe(3);
    const found = (
      await call(app, 'GET', '/v1/admin/comments?filter=VISIBLE&q=Тайлангүй', admin.accessToken)
    ).json();
    expect(found.total).toBe(1);
    expect(
      (await call(app, 'GET', '/v1/admin/comments?filter=NOPE', admin.accessToken)).statusCode,
    ).toBe(400);
  });

  it('hide, restore (clears reports), dismiss and delete each run once and write an audit row', async () => {
    const { episode, member } = await setup();
    const c = (await post(episode.id, member.accessToken, 'Шалгах')).json().comment;
    const r = await other('r@example.com');
    await call(app, 'POST', `/v1/comments/${c.id}/report`, r.accessToken, { reason: 'SPAM' });
    const admin = await makeAdmin(app);
    const act = (action: string) =>
      call(app, 'POST', `/v1/admin/comments/${c.id}/${action}`, admin.accessToken);
    const status = async () =>
      (await testDb.comment.findUniqueOrThrow({ where: { id: c.id } })).status;

    expect((await act('hide')).statusCode).toBe(204);
    expect(await status()).toBe('HIDDEN');
    expect((await act('hide')).statusCode).toBe(409);
    expect((await act('dismiss')).statusCode).toBe(409);

    expect((await act('restore')).statusCode).toBe(204);
    expect(await status()).toBe('VISIBLE');
    expect(await testDb.commentReport.count({ where: { commentId: c.id } })).toBe(0);
    expect((await act('restore')).statusCode).toBe(409);

    await call(app, 'POST', `/v1/comments/${c.id}/report`, r.accessToken, { reason: 'SPAM' });
    expect((await act('dismiss')).statusCode).toBe(204);
    expect(await testDb.commentReport.count({ where: { commentId: c.id } })).toBe(0);

    expect((await act('delete')).statusCode).toBe(204);
    expect(await status()).toBe('DELETED');
    expect((await act('delete')).statusCode).toBe(409);
    expect(
      (await call(app, 'POST', '/v1/admin/comments/nope/hide', admin.accessToken)).statusCode,
    ).toBe(404);
    const actions = (await testDb.auditLog.findMany({ where: { targetType: 'Comment' } }))
      .map((a) => a.action)
      .sort();
    expect(actions).toEqual([
      'comment.delete',
      'comment.dismiss',
      'comment.hide',
      'comment.restore',
    ]);
  });

  it('a deleted comment is gone for readers and the admin can mute and unmute its author', async () => {
    const { episode, member } = await setup();
    const c = (await post(episode.id, member.accessToken, 'Шүүмжлэл')).json().comment;
    const admin = await makeAdmin(app);
    await call(app, 'POST', `/v1/admin/comments/${c.id}/delete`, admin.accessToken);
    expect((await list(episode.id, member.accessToken)).json().items).toEqual([]);

    const mute = await call(
      app,
      'POST',
      `/v1/admin/users/${member.userId}/comment-mute`,
      admin.accessToken,
    );
    expect(mute.json()).toEqual({ muted: true });
    expect((await post(episode.id, member.accessToken, 'Дахин')).statusCode).toBe(403);
    await call(app, 'POST', `/v1/admin/users/${member.userId}/comment-mute`, admin.accessToken);
    expect(await testDb.auditLog.count({ where: { action: 'user.comment_mute' } })).toBe(1);
    const unmute = await call(
      app,
      'DELETE',
      `/v1/admin/users/${member.userId}/comment-mute`,
      admin.accessToken,
    );
    expect(unmute.json()).toEqual({ muted: false });
    expect((await post(episode.id, member.accessToken, 'Дахин бичив')).statusCode).toBe(201);
    // Admins cannot be muted, unknown users are 404.
    expect(
      (await call(app, 'POST', `/v1/admin/users/${admin.userId}/comment-mute`, admin.accessToken))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(app, 'POST', '/v1/admin/users/nope/comment-mute', admin.accessToken)).statusCode,
    ).toBe(404);
  });
});

describe('GET /v1/app-config supportEmail', () => {
  it('is null without SUPPORT_EMAIL and the address with it', async () => {
    expect((await app.inject({ url: '/v1/app-config' })).json().supportEmail).toBeNull();
    await app.close();
    app = await authApp({ SUPPORT_EMAIL: 'help@example.com' });
    expect((await app.inject({ url: '/v1/app-config' })).json().supportEmail).toBe(
      'help@example.com',
    );
  });
});
