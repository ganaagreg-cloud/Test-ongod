import { createEmailJob } from '../email';
import type { Mailer } from '../email/mailer';
import { JobRegistry } from './registry';

/** All job handlers. Register new job types here. */
export function createJobRegistry(deps: { mailer: Mailer }) {
  return new JobRegistry().register(createEmailJob(deps.mailer));
}
