import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Company routes must use req.db (scoped to the caller's empresa). Only these files may import the
// raw, unscoped `prisma` client.
const ALLOWED = new Set([
  'prisma.ts',
  'seed.ts',
  'routes/public.ts',
  'routes/auth.ts',
  'routes/platform.ts',
  'routes/internal.ts',
  'auth/middleware.ts',
  'realtime/socket.ts',
  'lib/token.ts',
]);
const ALLOWED_DIRS = ['tenant/', 'scripts/'];

const SRC = path.join(__dirname, '..', 'src');

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? tsFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('prisma sem filtro de empresa', () => {
  it('só é importado pelos arquivos permitidos', () => {
    const offenders = tsFiles(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel) && !ALLOWED_DIRS.some((dir) => rel.startsWith(dir)))
      .filter((rel) => /from\s+['"](\.\.?\/)+prisma['"]/.test(fs.readFileSync(path.join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
