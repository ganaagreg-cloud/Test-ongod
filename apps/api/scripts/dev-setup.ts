// DEV ONLY: run by `pnpm dev` after the migrations. Seeds the demo data once, when the database
// has no users yet. Never re-seeds, so changes made while exploring (TOTP, approvals) stay.
import { spawnSync } from 'node:child_process';
import { createDb } from '../src/db';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:setup is for local development only.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}

const db = createDb(url);
const users = await db.user.count();
await db.$disconnect();

if (users > 0) {
  console.log(`Database already has ${users} users: not seeding.`);
} else {
  console.log('Empty database: seeding demo data ...');
  const result = spawnSync('pnpm', ['run', 'db:seed'], { stdio: 'inherit', shell: true });
  process.exit(result.status ?? 1);
}
