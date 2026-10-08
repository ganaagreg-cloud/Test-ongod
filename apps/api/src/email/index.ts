import { z } from 'zod';
import { enqueue, type EnqueueOptions, type JobWriter } from '../jobs/queue';
import { defineJob } from '../jobs/registry';
import type { Mailer } from './mailer';
import {
  emailTemplateSchemas,
  renderEmail,
  type EmailParams,
  type EmailTemplate,
} from './templates';

const emailPayloadSchema = z.object({
  to: z.email(),
  template: z.enum(Object.keys(emailTemplateSchemas) as [EmailTemplate, ...EmailTemplate[]]),
  params: z.record(z.string(), z.unknown()),
});

const emailJobSpec = { type: 'email.send', schema: emailPayloadSchema, maxAttempts: 8 };

/** The email job. Emails are sent only from here, never inside a request. */
export function createEmailJob(mailer: Mailer) {
  return defineJob({
    ...emailJobSpec,
    async handle({ to, template, params }, { log }) {
      const parsed = emailTemplateSchemas[template].parse(params);
      await mailer.send(to, renderEmail(template, parsed));
      log.info({ template }, 'email sent');
    },
  });
}

/** Queues an email. Pass a transaction client to send only if the surrounding change commits. */
export async function enqueueEmail<T extends EmailTemplate>(
  db: JobWriter,
  to: string,
  template: T,
  params: EmailParams<T>,
  opts?: EnqueueOptions,
) {
  // Validate template params now so bad input fails in the caller, not later in the worker.
  emailTemplateSchemas[template].parse(params);
  return enqueue(db, emailJobSpec, { to, template, params }, opts);
}
