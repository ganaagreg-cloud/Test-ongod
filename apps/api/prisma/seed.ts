// Dev/demo seed. Idempotent: fixed ids + upsert, safe to run repeatedly.
// Passwords come from env (SEED_OWNER_PASSWORD, SEED_USER_PASSWORD); never hardcode them.
import argon2 from 'argon2';
import { z } from 'zod';
import { appConfigKeys } from '@ongod/shared';
import { createDb, type Prisma } from '../src/db';
import type { PaymentMethod } from '../src/generated/prisma/client';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_OWNER_EMAIL: z.email(),
    SEED_OWNER_PASSWORD: z.string().min(8),
    SEED_USER_PASSWORD: z.string().min(8),
  })
  .parse(process.env);

const db = createDb(env.DATABASE_URL);
const DAY = 24 * 60 * 60_000;
const now = new Date();
const daysFromNow = (d: number) => new Date(now.getTime() + d * DAY);

const hash = (password: string) => argon2.hash(password, { type: argon2.argon2id });

async function main() {
  const [ownerHash, userHash] = await Promise.all([
    hash(env.SEED_OWNER_PASSWORD),
    hash(env.SEED_USER_PASSWORD),
  ]);

  await db.appConfig.upsert({
    where: { key: appConfigKeys.minVersionIos },
    create: { key: appConfigKeys.minVersionIos, value: '0.1.0' },
    update: {},
  });
  await db.appConfig.upsert({
    where: { key: appConfigKeys.minVersionAndroid },
    create: { key: appConfigKeys.minVersionAndroid, value: '0.1.0' },
    update: {},
  });

  const plan = await db.plan.upsert({
    where: { id: 'seed_plan_yearly' },
    create: { id: 'seed_plan_yearly', name: 'Жилийн эрх', durationDays: 365, priceMnt: 100000 },
    update: { name: 'Жилийн эрх', durationDays: 365, priceMnt: 100000, active: true },
  });

  // --- Users: one per status, plus access variations ---
  type SeedUser = Prisma.UserUncheckedCreateInput & { id: string };
  const users: SeedUser[] = [
    {
      id: 'seed_user_owner',
      username: 'owner',
      email: env.SEED_OWNER_EMAIL.toLowerCase(),
      emailVerifiedAt: now,
      passwordHash: ownerHash,
      firstName: 'Эзэмшигч',
      lastName: 'Онгод',
      phone: '99000000',
      status: 'ACTIVE',
      role: 'OWNER',
    },
    {
      id: 'seed_user_active',
      username: 'bat',
      email: 'bat@example.com',
      emailVerifiedAt: now,
      passwordHash: userHash,
      firstName: 'Бат',
      lastName: 'Дорж',
      phone: '99000001',
      status: 'ACTIVE',
      accessUntil: daysFromNow(300),
    },
    {
      // Store-review demo account (SPEC E: manual grant).
      id: 'seed_user_demo',
      username: 'demo',
      email: 'demo@example.com',
      emailVerifiedAt: now,
      passwordHash: userHash,
      firstName: 'Демо',
      lastName: 'Хэрэглэгч',
      phone: '99000002',
      status: 'ACTIVE',
      accessUntil: daysFromNow(365),
    },
    {
      // Paid and waiting for admin approval.
      id: 'seed_user_submitted',
      username: 'saraa',
      email: 'saraa@example.com',
      emailVerifiedAt: now,
      passwordHash: userHash,
      firstName: 'Сараа',
      lastName: 'Ганбат',
      phone: '99000003',
      status: 'ACTIVE',
    },
    {
      // Access ended.
      id: 'seed_user_expired',
      username: 'tuya',
      email: 'tuya@example.com',
      emailVerifiedAt: now,
      passwordHash: userHash,
      firstName: 'Туяа',
      lastName: 'Болд',
      phone: '99000004',
      status: 'ACTIVE',
      accessUntil: daysFromNow(-10),
    },
    {
      // Email not verified yet: can log in, cannot subscribe.
      id: 'seed_user_unverified',
      username: 'temuujin',
      email: 'temuujin@example.com',
      passwordHash: userHash,
      firstName: 'Тэмүүжин',
      lastName: 'Очир',
      phone: '99000005',
      status: 'ACTIVE',
    },
    {
      // Signed in with Google, has not completed the profile.
      id: 'seed_user_pending',
      username: 'pending@example.com',
      email: 'pending@example.com',
      emailVerifiedAt: now,
      firstName: '',
      lastName: '',
      phone: '',
      status: 'PENDING_PROFILE',
    },
    {
      id: 'seed_user_disabled',
      username: 'disabled',
      email: 'disabled@example.com',
      emailVerifiedAt: now,
      passwordHash: userHash,
      firstName: 'Хаалттай',
      lastName: 'Хэрэглэгч',
      phone: '99000006',
      status: 'DISABLED',
    },
    {
      // Deleted: personal data anonymized (SPEC H), payment records kept.
      id: 'seed_user_deleted',
      username: 'deleted-seed_user_deleted',
      email: 'deleted-seed_user_deleted@deleted.invalid',
      firstName: '',
      lastName: '',
      phone: '',
      status: 'DELETED',
      deletedAt: daysFromNow(-5),
    },
  ];

  for (const { id, ...data } of users) {
    await db.user.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  await db.authIdentity.upsert({
    where: {
      provider_providerSubject: { provider: 'GOOGLE', providerSubject: 'seed-google-sub-1' },
    },
    create: {
      id: 'seed_identity_pending',
      userId: 'seed_user_pending',
      provider: 'GOOGLE',
      providerSubject: 'seed-google-sub-1',
      email: 'pending@example.com',
    },
    update: {},
  });

  // --- Subscriptions in the states the admin UI needs ---
  type SeedSubscription = Omit<Prisma.SubscriptionUncheckedCreateInput, 'planId' | 'amountMnt'> & {
    id: string;
    payment?: { method: PaymentMethod; amountMnt?: number };
  };
  const subscriptions: SeedSubscription[] = [
    {
      id: 'seed_sub_active',
      userId: 'seed_user_active',
      status: 'ACTIVE',
      referenceCode: 'ONG-7K3QX',
      submittedAt: daysFromNow(-66),
      startsAt: daysFromNow(-65),
      endsAt: daysFromNow(300),
      decidedById: 'seed_user_owner',
      decidedAt: daysFromNow(-65),
      payment: { method: 'BANK_TRANSFER' },
    },
    {
      id: 'seed_sub_demo',
      userId: 'seed_user_demo',
      status: 'ACTIVE',
      referenceCode: 'ONG-D3M4R',
      startsAt: now,
      endsAt: daysFromNow(365),
      decidedById: 'seed_user_owner',
      decidedAt: now,
      payment: { method: 'MANUAL_GRANT', amountMnt: 0 },
    },
    {
      id: 'seed_sub_submitted',
      userId: 'seed_user_submitted',
      status: 'PAYMENT_SUBMITTED',
      referenceCode: 'ONG-H8WPN',
      payerNote: 'Хаан банкнаас шилжүүлсэн',
      transferAt: daysFromNow(-1),
      submittedAt: daysFromNow(-1),
    },
    {
      id: 'seed_sub_expired',
      userId: 'seed_user_expired',
      status: 'EXPIRED',
      referenceCode: 'ONG-R2TZM',
      startsAt: daysFromNow(-375),
      endsAt: daysFromNow(-10),
      decidedById: 'seed_user_owner',
      decidedAt: daysFromNow(-375),
      payment: { method: 'BANK_TRANSFER' },
    },
  ];

  for (const { payment, ...s } of subscriptions) {
    const data = { ...s, planId: plan.id, amountMnt: plan.priceMnt };
    await db.subscription.upsert({ where: { id: s.id }, create: data, update: data });
    if (payment) {
      const id = `${s.id}_payment`;
      const p = {
        subscriptionId: s.id,
        method: payment.method,
        amountMnt: payment.amountMnt ?? plan.priceMnt,
      };
      await db.payment.upsert({ where: { id }, create: { id, ...p }, update: p });
    }
  }

  // --- Catalog ---
  const categories = [
    { id: 'seed_cat_history', name: 'Түүх', slug: 'tuukh', sortOrder: 1 },
    { id: 'seed_cat_customs', name: 'Ёс заншил', slug: 'yos-zanshil', sortOrder: 2 },
    { id: 'seed_cat_talks', name: 'Ярилцлага', slug: 'yariltslaga', sortOrder: 3 },
  ];
  for (const { id, ...data } of categories) {
    await db.category.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  const episodes = [
    {
      n: 1,
      cat: 'seed_cat_history',
      title: 'Хүннү гүрний үүсэл',
      status: 'PUBLISHED',
      days: -30,
      min: 32,
    },
    {
      n: 2,
      cat: 'seed_cat_history',
      title: 'Их Монгол улсын зам',
      status: 'PUBLISHED',
      days: -20,
      min: 38,
    },
    {
      n: 3,
      cat: 'seed_cat_customs',
      title: 'Цагаан сарын уламжлал',
      status: 'PUBLISHED',
      days: -10,
      min: 24,
    },
    {
      n: 4,
      cat: 'seed_cat_talks',
      title: 'Малчин өвөөгийн яриа',
      status: 'PUBLISHED',
      days: -3,
      min: 41,
    },
    { n: 5, cat: 'seed_cat_customs', title: 'Гэрийн ёс', status: 'SCHEDULED', days: 3, min: 27 },
    {
      n: 6,
      cat: 'seed_cat_talks',
      title: 'Шинэ ярилцлага (ноорог)',
      status: 'DRAFT',
      days: 0,
      min: 30,
    },
  ] as const;

  for (const e of episodes) {
    const id = `seed_ep_${e.n}`;
    const data = {
      categoryId: e.cat,
      title: e.title,
      description: `${e.title}. Туршилтын тайлбар.`,
      coverPath: `covers/seed/ep${e.n}.jpg`,
      status: e.status,
      scheduledFor: e.status === 'SCHEDULED' ? daysFromNow(e.days) : null,
      publishedAt: e.status === 'PUBLISHED' ? daysFromNow(e.days) : null,
    };
    await db.episode.upsert({ where: { id }, create: { id, ...data }, update: data });

    const asset = {
      episodeId: id,
      kind: 'AUDIO',
      provider: 'BUNNY_STORAGE',
      path: `audio/seed/ep${e.n}.mp3`,
      status: e.status === 'DRAFT' ? 'UPLOADING' : 'READY',
      durationSec: e.status === 'DRAFT' ? null : e.min * 60,
    } as const;
    await db.mediaAsset.upsert({
      where: { id: `${id}_audio` },
      create: { id: `${id}_audio`, ...asset },
      update: asset,
    });
  }

  console.log(
    `Seeded: ${users.length} users, 1 plan, ${categories.length} categories, ${episodes.length} episodes.`,
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}
