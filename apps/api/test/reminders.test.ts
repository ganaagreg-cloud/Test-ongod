import { describe, expect, it } from 'vitest';
import {
  cronTasks,
  expireEndedSubscriptions,
  expirePendingPayments,
  sendAccessEndingReminders,
} from '../src/cron/tasks';
import { mn } from '../src/i18n/mn';
import { CRON_SECRET, testApp, testDb } from './helpers';
import { DAY, jobsOf, makeActive, makeMember, makePlan, notifyEmails } from './admin-helpers';

const run = (now = new Date()) => sendAccessEndingReminders.run({ db: testDb, now });

async function memberWithPeriod(endsInDays: number, email = 'member@example.com') {
  const app = await testApp();
  const plan = await makePlan();
  const member = await makeMember(app, email);
  const now = Date.now();
  const sub = await makeActive(
    member.userId,
    plan.id,
    new Date(now + endsInDays * DAY - 365 * DAY),
    new Date(now + endsInDays * DAY),
  );
  await app.close();
  return { member, plan, sub };
}

describe('access-ending reminder (SPEC F)', () => {
  it('queues one email and one push for a period that ends within 14 days, and sets the flag', async () => {
    const { member, sub } = await memberWithPeriod(10);

    expect(await run()).toEqual({ affected: 1 });

    const emails = await notifyEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]!.payload).toMatchObject({
      to: 'member@example.com',
      template: 'accessEnding',
    });
    const pushes = await jobsOf('push.send');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload).toMatchObject({
      userId: member.userId,
      title: mn.push.accessEnding.title,
    });
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: sub.id } })).reminderSentAt,
    ).not.toBeNull();
  });

  it('sends only once, however often the cron ticks', async () => {
    await memberWithPeriod(10);
    expect(await run()).toEqual({ affected: 1 });
    expect(await run()).toEqual({ affected: 0 });
    expect(await run(new Date(Date.now() + 5 * DAY))).toEqual({ affected: 0 });
    expect(await notifyEmails()).toHaveLength(1);
    expect(await jobsOf('push.send')).toHaveLength(1);
  });

  it('sends only once when ticks run at the same time', async () => {
    await memberWithPeriod(10);
    const results = await Promise.all([run(), run(), run(), run()]);
    expect(results.reduce((sum, r) => sum + r.affected, 0)).toBe(1);
    expect(await notifyEmails()).toHaveLength(1);
    expect(await jobsOf('push.send')).toHaveLength(1);
  });

  it('does not send early (more than 14 days left) and sends once the 14-day mark is reached', async () => {
    await memberWithPeriod(20);
    expect(await run()).toEqual({ affected: 0 });
    expect(await run(new Date(Date.now() + 5 * DAY))).toEqual({ affected: 0 });
    expect(await run(new Date(Date.now() + 7 * DAY))).toEqual({ affected: 1 });
    expect(await notifyEmails()).toHaveLength(1);
  });

  it('does not remind about a period that already ended, or one that is not ACTIVE', async () => {
    const { sub } = await memberWithPeriod(-1);
    expect(await run()).toEqual({ affected: 0 });

    await testDb.subscription.update({
      where: { id: sub.id },
      data: { endsAt: new Date(Date.now() + 5 * DAY), status: 'REVOKED' },
    });
    expect(await run()).toEqual({ affected: 0 });
    expect(await notifyEmails()).toHaveLength(0);
  });

  it('skips a period that was already renewed by a later ACTIVE period; the later one is reminded in its turn', async () => {
    const { member, plan, sub } = await memberWithPeriod(10);
    const laterEnd = new Date(Date.now() + 10 * DAY + 365 * DAY);
    const later = await makeActive(
      member.userId,
      plan.id,
      new Date(Date.now() + 10 * DAY),
      laterEnd,
    );

    expect(await run()).toEqual({ affected: 0 });
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: sub.id } })).reminderSentAt,
    ).toBeNull();

    // 365 days later the renewal itself is 10 days from its end.
    expect(await run(new Date(Date.now() + 365 * DAY))).toEqual({ affected: 1 });
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: later.id } })).reminderSentAt,
    ).not.toBeNull();
  });

  it('a renewal bought after the reminder gets its own reminder later', async () => {
    const { member, plan } = await memberWithPeriod(10);
    await run();
    await makeActive(
      member.userId,
      plan.id,
      new Date(Date.now() + 10 * DAY),
      new Date(Date.now() + 375 * DAY),
    );
    expect(await run(new Date(Date.now() + 370 * DAY))).toEqual({ affected: 1 });
    expect(await notifyEmails()).toHaveLength(2);
  });

  it('does not remind a disabled or deleted user', async () => {
    const { member } = await memberWithPeriod(10);
    await testDb.user.update({ where: { id: member.userId }, data: { status: 'DISABLED' } });
    expect(await run()).toEqual({ affected: 0 });
    await testDb.user.update({ where: { id: member.userId }, data: { status: 'DELETED' } });
    expect(await run()).toEqual({ affected: 0 });
  });

  it('reminds each member separately', async () => {
    await memberWithPeriod(3, 'a@example.com');
    await memberWithPeriod(13, 'b@example.com');
    await memberWithPeriod(30, 'c@example.com');
    expect(await run()).toEqual({ affected: 2 });
    const to = (await notifyEmails()).map((j) => j.payload.to).sort();
    expect(to).toEqual(['a@example.com', 'b@example.com']);
  });

  it('runs from POST /v1/cron/tick', async () => {
    await memberWithPeriod(10);
    const app = await testApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks.sendAccessEndingReminders).toEqual({ affected: 1 });
    await app.close();
  });

  it('is part of the default task list', () => {
    expect(cronTasks.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        expirePendingPayments.name,
        expireEndedSubscriptions.name,
        sendAccessEndingReminders.name,
      ]),
    );
  });
});

describe('expiry (SPEC D, F)', () => {
  it('PENDING_PAYMENT older than 7 days becomes EXPIRED; a PAYMENT_SUBMITTED one is left alone', async () => {
    const app = await testApp();
    const plan = await makePlan();
    const member = await makeMember(app, 'm@example.com');
    await app.close();
    const mk = (code: string, status: 'PENDING_PAYMENT' | 'PAYMENT_SUBMITTED', ageDays: number) =>
      testDb.subscription.create({
        data: {
          userId: member.userId,
          planId: plan.id,
          referenceCode: code,
          status,
          amountMnt: 1,
          createdAt: new Date(Date.now() - ageDays * DAY),
        },
      });
    const old = await mk('ONG-OLD22', 'PENDING_PAYMENT', 7.1);
    const fresh = await mk('ONG-NEW22', 'PENDING_PAYMENT', 6.9);
    const waiting = await mk('ONG-SUB22', 'PAYMENT_SUBMITTED', 30);

    expect(await expirePendingPayments.run({ db: testDb, now: new Date() })).toEqual({
      affected: 1,
    });
    const status = async (id: string) =>
      (await testDb.subscription.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(old.id)).toBe('EXPIRED');
    expect(await status(fresh.id)).toBe('PENDING_PAYMENT');
    expect(await status(waiting.id)).toBe('PAYMENT_SUBMITTED');
  });

  it('an ACTIVE period past its end becomes EXPIRED and the access check already refuses it', async () => {
    const { member, sub } = await memberWithPeriod(-1);
    expect(await expireEndedSubscriptions.run({ db: testDb, now: new Date() })).toEqual({
      affected: 1,
    });
    expect((await testDb.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe(
      'EXPIRED',
    );
    const user = await testDb.user.findUniqueOrThrow({ where: { id: member.userId } });
    expect(user.accessUntil!.getTime()).toBeLessThan(Date.now());
  });
});
