import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

export type Db = PrismaClient;
export type { Prisma } from './generated/prisma/client';

export function createDb(databaseUrl: string): Db {
  return new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}
