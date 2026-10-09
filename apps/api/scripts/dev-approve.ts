// DEV ONLY: approves a PAYMENT_SUBMITTED request of the LOCAL database as the seeded owner,
// through the same code the admin API uses (period, Payment, access, email + push, audit).
// Used by the portal e2e test; handy for trying the flow by hand.
//   pnpm dev:approve ONG-K7M2Q
//   pnpm dev:approve ONG-K7M2Q reject "wrong amount"
import { createDecisionService } from '../src/admin/decisions';
import { createDb } from '../src/db';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:approve is for local development only.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}

// The reason may be several words (a shell can split it): everything after the action.
const [referenceCode, action = 'approve', ...reasonWords] = process.argv.slice(2);
const reason = reasonWords.join(' ') || 'rejected from dev:approve';
if (!referenceCode || !/^ONG-[A-Z0-9]{5}$/.test(referenceCode)) {
  console.error('Usage: pnpm dev:approve ONG-XXXXX [approve|reject] [reason]');
  process.exit(1);
}

const db = createDb(url);
try {
  const [owner, subscription] = await Promise.all([
    db.user.findFirst({ where: { role: 'OWNER' } }),
    db.subscription.findUnique({ where: { referenceCode } }),
  ]);
  if (!owner) throw new Error('No OWNER user: run the seed first.');
  if (!subscription) throw new Error(`No subscription ${referenceCode}.`);

  const decisions = createDecisionService({ db });
  const result =
    action === 'reject'
      ? await decisions.reject(owner, subscription.id, reason)
      : await decisions.approve(owner, subscription.id);
  console.log(
    `${referenceCode}: ${result.status}${result.endsAt ? ` until ${result.endsAt}` : ''}`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
