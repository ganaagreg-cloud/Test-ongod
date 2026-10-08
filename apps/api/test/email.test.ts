import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createEmailJob, enqueueEmail } from '../src/email';
import type { Mailer } from '../src/email/mailer';
import { renderEmail } from '../src/email/templates';
import { JobRegistry } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import { testDb } from './helpers';

describe('email', () => {
  it('is queued as a job and sent by the worker with a Mongolian template', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const mailer: Mailer = { send: async (to, email) => void sent.push({ to, ...email }) };

    await enqueueEmail(testDb, 'bat@example.com', 'verifyEmail', {
      firstName: 'Бат',
      code: '123456',
    });
    expect(sent).toHaveLength(0); // nothing is sent inside the caller

    const worker = new JobWorker(
      testDb,
      new JobRegistry().register(createEmailJob(mailer)),
      pino({ level: 'silent' }),
    );
    expect(await worker.runOnce()).toBe(1);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'bat@example.com',
      subject: expect.stringContaining('баталгаажуулах'),
    });
    expect(sent[0]!.text).toContain('123456');
  });

  it('rejects invalid template params when enqueuing', async () => {
    await expect(
      enqueueEmail(testDb, 'bat@example.com', 'verifyEmail', { firstName: 'Бат', code: '12' }),
    ).rejects.toThrow();
    expect(await testDb.job.count()).toBe(0);
  });

  it('only enqueues when the surrounding transaction commits', async () => {
    await expect(
      testDb.$transaction(async (tx) => {
        await enqueueEmail(tx, 'bat@example.com', 'resetPassword', {
          firstName: 'Бат',
          code: '654321',
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await testDb.job.count()).toBe(0);
  });

  it('escapes user-provided values in the HTML part', () => {
    const { html } = renderEmail('paymentRejected', {
      firstName: '<script>',
      reason: 'a & b',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });
});
