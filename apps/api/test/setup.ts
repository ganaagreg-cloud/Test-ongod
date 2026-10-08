import { afterAll, beforeEach } from 'vitest';
import { resetDb, testDb } from './helpers';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});
