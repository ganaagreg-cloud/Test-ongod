import type { Db } from '../db';
import { createEmailJob } from '../email';
import type { Mailer } from '../email/mailer';
import { createMediaJobs } from '../media/jobs';
import type { MediaRuntime } from '../media/storage';
import { createAlertJob } from '../monitoring/alerts';
import { createPushJob, type PushSender } from '../push';
import { JobRegistry } from './registry';

/** All job handlers. Register new job types here. */
export function createJobRegistry(deps: {
  db: Db;
  mailer: Mailer;
  push: PushSender;
  media: MediaRuntime;
}) {
  return new JobRegistry().register(
    createEmailJob(deps.mailer),
    createAlertJob(deps.mailer),
    createPushJob(deps.db, deps.push),
    ...createMediaJobs({ db: deps.db, ...deps.media }),
  );
}
