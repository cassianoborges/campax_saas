import '../env';

import { randomUUID } from 'crypto';
import readline from 'readline';
import { prisma } from '../prisma';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password';

// The only way to create a platform_admin — no API route can create or promote one.
//
//   npm run create-platform-admin -- --email equipe@campax.com.br [--name "Nome"]
//
// Asks for the password without echoing it; with a non-TTY stdin (e.g. piped) it reads the first line.

function argValue(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function readPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  if (process.stdin.isTTY) {
    // Hide what's typed: print the prompt once, then swallow the echo of every keystroke.
    process.stdout.write(prompt);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
  }
  return new Promise((resolve) => {
    rl.question(process.stdin.isTTY ? '' : prompt, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = argValue('--email')?.trim().toLowerCase();
  const fullName = argValue('--name');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Informe um e-mail válido: --email equipe@campax.com.br');
  }

  const existing = await prisma.profiles.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Já existe um usuário com o e-mail ${email} (papel ${existing.role}). Use outro e-mail.`);
  }

  const password = await readPassword('Senha: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (process.stdin.isTTY && (await readPassword('Repita a senha: ')) !== password) {
    throw new Error('As senhas não conferem.');
  }

  const profile = await prisma.profiles.create({
    data: {
      id: randomUUID(),
      email,
      full_name: fullName,
      password_hash: await hashPassword(password),
      role: 'platform_admin',
      empresa_id: null,
    },
  });
  console.log(`✓ platform_admin criado: ${profile.email} (${profile.id})`);
}

main()
  .catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
