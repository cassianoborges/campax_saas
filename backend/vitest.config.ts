import { defineConfig } from 'vitest/config';

// Force the test env so src/env.ts loads .env.test (campax_test), even if the shell has NODE_ENV set.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    env: { NODE_ENV: 'test' },
    // All test files share one database, so they must not run concurrently.
    fileParallelism: false,
  },
});
