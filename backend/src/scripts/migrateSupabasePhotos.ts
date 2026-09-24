import '../env';

import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { FALECIDO_FOTOS_DIR } from '../lib/uploads';

// Copies velório photos still hosted on Supabase Storage into backend/uploads (same
// falecido-fotos/<velorio_id>/foto.<ext> layout the upload route uses) and repoints
// velorios.foto_falecido to the local /files URL. Idempotent: rows already pointing
// elsewhere are skipped, so it can be re-run after the final Supabase data re-sync.
//
//   npm run migrate-supabase-photos -- --base-url https://backend.campax.com.br          (dry run)
//   npm run migrate-supabase-photos -- --base-url https://backend.campax.com.br --apply

const SUPABASE_STORAGE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/falecido-fotos\//;
const EXT_BY_TYPE: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

function parseArgs() {
  const args = process.argv.slice(2);
  const baseUrlIndex = args.indexOf('--base-url');
  const baseUrl = baseUrlIndex >= 0 ? args[baseUrlIndex + 1]?.replace(/\/+$/, '') : undefined;
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
    throw new Error('Informe --base-url https://... (a URL pública do backend; precisa ser HTTPS)');
  }
  return { baseUrl, apply: args.includes('--apply') };
}

async function main() {
  const { baseUrl, apply } = parseArgs();
  const velorios = await prisma.velorios.findMany({
    where: { foto_falecido: { contains: '.supabase.co/storage/' } },
    select: { id: true, foto_falecido: true },
  });
  console.log(`${velorios.length} foto(s) no Supabase Storage${apply ? '' : ' — simulação, use --apply para gravar'}`);

  let failures = 0;
  for (const { id, foto_falecido } of velorios) {
    const sourceUrl = foto_falecido!;
    if (!SUPABASE_STORAGE.test(sourceUrl)) {
      console.warn(`⚠ ${id}: URL fora do padrão esperado, ignorada: ${sourceUrl}`);
      failures++;
      continue;
    }

    try {
      const response = await fetch(sourceUrl);
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!response.ok || !EXT_BY_TYPE[contentType]) {
        throw new Error(`HTTP ${response.status}, content-type "${contentType}"`);
      }
      const body = Buffer.from(await response.arrayBuffer());
      const fileName = `foto${EXT_BY_TYPE[contentType]}`;
      const localUrl = `${baseUrl}/files/falecido-fotos/${id}/${fileName}`;

      if (apply) {
        const dir = path.join(FALECIDO_FOTOS_DIR, id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, fileName), body);
        await prisma.velorios.update({ where: { id }, data: { foto_falecido: localUrl } });
      }
      console.log(`✓ ${id}: ${body.length} bytes → ${localUrl}`);
    } catch (error) {
      console.error(`✗ ${id}: ${(error as Error).message}`);
      failures++;
    }
  }

  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
