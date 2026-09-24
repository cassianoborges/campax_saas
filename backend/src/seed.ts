import './env';

import crypto from 'crypto';
import { prisma } from './prisma';
import { hashPassword } from './auth/password';

// One-time migration helper: Supabase's auth.users (and its password hashes) was
// never copied into the local Postgres snapshot, so every existing `profiles` row
// has no password_hash yet. This assigns a random temporary password to every
// account that doesn't have one, so admins can log in and change it afterwards.
async function main() {
  const usersWithoutPassword = await prisma.profiles.findMany({ where: { password_hash: null } });

  if (usersWithoutPassword.length === 0) {
    console.log('Todos os usuários já têm senha definida — nada a fazer.');
    return;
  }

  console.log(`Definindo senha temporária para ${usersWithoutPassword.length} usuário(s):\n`);

  for (const user of usersWithoutPassword) {
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const password_hash = await hashPassword(tempPassword);
    await prisma.profiles.update({ where: { id: user.id }, data: { password_hash } });
    console.log(`  ${user.email.padEnd(30)} -> ${tempPassword}`);
  }

  console.log('\nRepasse cada senha ao respectivo usuário por um canal seguro; recomenda-se trocá-la no primeiro login.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
