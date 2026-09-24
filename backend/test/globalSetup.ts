import '../src/env';

import { PrismaClient } from '@prisma/client';
import { assertTestDatabase } from './testDb';

export default async function setup() {
  assertTestDatabase();

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1 FROM profiles LIMIT 1`;
  } catch (error) {
    throw new Error(
      'O banco campax_test não existe ou está sem schema. Rode: backend/scripts/refresh-dev-db.sh test\n' +
        (error as Error).message,
    );
  } finally {
    await prisma.$disconnect();
  }
}
