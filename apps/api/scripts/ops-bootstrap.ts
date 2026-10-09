// PRODUCTION BOOTSTRAP (audit A-01). Creates, only when missing, what a fresh database needs:
//   - the OWNER account (no TOTP yet: the owner sets it up at the first admin login, ADR-0022)
//   - one active Plan
//   - the minimum app versions
// It never overwrites anything: an existing OWNER, an existing active Plan or an existing
// AppConfig key is left as it is. Safe to run twice. Values come from the environment of this one
// command, never from a file in git, and nothing secret is printed.
//
//   BOOTSTRAP_OWNER_EMAIL=... BOOTSTRAP_OWNER_PASSWORD=... BOOTSTRAP_OWNER_FIRST_NAME=... \
//   BOOTSTRAP_OWNER_LAST_NAME=... BOOTSTRAP_OWNER_PHONE=... \
//   BOOTSTRAP_PLAN_NAME="Жилийн эрх" BOOTSTRAP_PLAN_DAYS=365 BOOTSTRAP_PLAN_PRICE_MNT=... \
//   pnpm --filter @ongod/api ops:bootstrap
//
// The store reviewer demo account is NOT created here: register it normally and grant access in
// admin (docs/runbooks/STORE.md).
import argon2 from 'argon2';
import { z } from 'zod';
import { appConfigKeys } from '@ongod/shared';
import { createDb } from '../src/db';

const env = z
  .object({
    DATABASE_URL: z.string().regex(/^mysql:\/\//),
    BOOTSTRAP_OWNER_EMAIL: z.email(),
    BOOTSTRAP_OWNER_PASSWORD: z.string().min(12),
    BOOTSTRAP_OWNER_USERNAME: z
      .string()
      .regex(/^[a-z0-9._]{3,30}$/)
      .default('owner'),
    BOOTSTRAP_OWNER_FIRST_NAME: z.string().trim().min(1),
    BOOTSTRAP_OWNER_LAST_NAME: z.string().trim().min(1),
    BOOTSTRAP_OWNER_PHONE: z.string().trim().min(6),
    BOOTSTRAP_PLAN_NAME: z.string().trim().min(1),
    BOOTSTRAP_PLAN_DAYS: z.coerce.number().int().min(1).max(3660),
    BOOTSTRAP_PLAN_PRICE_MNT: z.coerce.number().int().min(1),
    BOOTSTRAP_MIN_VERSION: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .default('0.1.0'),
  })
  .parse(process.env);

const db = createDb(env.DATABASE_URL);
try {
  const owner = await db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } });
  if (owner) {
    console.log('OWNER: already exists, left unchanged.');
  } else {
    const email = env.BOOTSTRAP_OWNER_EMAIL.toLowerCase();
    await db.user.create({
      data: {
        username: env.BOOTSTRAP_OWNER_USERNAME,
        email,
        emailVerifiedAt: new Date(),
        passwordHash: await argon2.hash(env.BOOTSTRAP_OWNER_PASSWORD, { type: argon2.argon2id }),
        firstName: env.BOOTSTRAP_OWNER_FIRST_NAME,
        lastName: env.BOOTSTRAP_OWNER_LAST_NAME,
        phone: env.BOOTSTRAP_OWNER_PHONE,
        status: 'ACTIVE',
        role: 'OWNER',
      },
    });
    console.log(`OWNER: created (${email}). Log in to /admin now and set up the authenticator.`);
  }

  const plan = await db.plan.findFirst({ where: { active: true }, select: { id: true } });
  if (plan) {
    console.log('PLAN: an active plan already exists, left unchanged.');
  } else {
    await db.plan.create({
      data: {
        name: env.BOOTSTRAP_PLAN_NAME,
        durationDays: env.BOOTSTRAP_PLAN_DAYS,
        priceMnt: env.BOOTSTRAP_PLAN_PRICE_MNT,
        active: true,
      },
    });
    console.log(
      `PLAN: created (${env.BOOTSTRAP_PLAN_DAYS} days, ${env.BOOTSTRAP_PLAN_PRICE_MNT} MNT).`,
    );
  }

  for (const key of [appConfigKeys.minVersionIos, appConfigKeys.minVersionAndroid]) {
    const row = await db.appConfig.findUnique({ where: { key } });
    if (row) {
      console.log(`APP CONFIG ${key}: exists (${row.value}), left unchanged.`);
    } else {
      await db.appConfig.create({ data: { key, value: env.BOOTSTRAP_MIN_VERSION } });
      console.log(`APP CONFIG ${key}: created (${env.BOOTSTRAP_MIN_VERSION}).`);
    }
  }
} finally {
  await db.$disconnect();
}
