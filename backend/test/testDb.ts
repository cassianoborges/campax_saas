import '../src/env';

const TEST_DB_NAME = 'campax_test';

// Every destructive test helper calls this first: the tests truncate tables, so they must never
// run against anything but campax_test — whatever NODE_ENV or .env file ended up loaded.
export function assertTestDatabase() {
  const url = process.env.DATABASE_URL;
  const dbName = url ? new URL(url).pathname.replace(/^\//, '') : undefined;
  if (dbName !== TEST_DB_NAME) {
    throw new Error(
      `Os testes só rodam contra o banco "${TEST_DB_NAME}", mas DATABASE_URL aponta para "${dbName ?? '(vazio)'}". ` +
        'Confira backend/.env.test.',
    );
  }
}
