// DEV ONLY: prints the current admin TOTP code for a user of the LOCAL database, so the API
// docs (/docs) can be used without a phone. Refuses to run with NODE_ENV=production.
//   pnpm dev:totp            (user "owner")
//   pnpm dev:totp saraa
import { generateSync } from 'otplib';
import { createDb } from '../src/db';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:totp is for local development only.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}

const username = (process.argv[2] ?? 'owner').toLowerCase();
const db = createDb(url);
try {
  const user = await db.user.findUnique({
    where: { username },
    select: { totpSecret: true, totpEnabledAt: true, role: true },
  });
  if (!user) {
    console.error(`No user "${username}".`);
    process.exitCode = 1;
  } else if (!user.totpSecret) {
    console.error(
      `"${username}" has no TOTP secret yet. Log in at /docs, call POST /v1/admin/totp/setup, then run this again.`,
    );
    process.exitCode = 1;
  } else {
    const code = generateSync({ secret: user.totpSecret });
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    console.log(
      `${code}   (valid for ~${left} s${user.totpEnabledAt ? '' : '; setup not confirmed yet'})`,
    );
  }
} finally {
  await db.$disconnect();
}
