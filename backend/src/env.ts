import path from 'path';
import dotenv from 'dotenv';

// Picks the env file by NODE_ENV so dev and tests never touch the production database:
// `npm run dev` → .env.development (campax_dev), Vitest → .env.test (campax_test).
// Anything else — including an unset NODE_ENV — falls back to .env (production).
const ENV_FILES: Record<string, string> = { development: '.env.development', test: '.env.test' };
const envFile = ENV_FILES[process.env.NODE_ENV ?? ''];

if (envFile) {
  // `override` is required: importing @prisma/client auto-loads backend/.env (production) into
  // process.env, and without it that DATABASE_URL would win over the dev/test one.
  dotenv.config({ path: path.join(__dirname, '..', envFile), override: true });
} else {
  // Production: variables set by PM2 (NODE_ENV, PORT) take precedence over .env.
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}
