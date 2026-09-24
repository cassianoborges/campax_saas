import { prisma } from '../prisma';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export async function generateUniqueToken(): Promise<string> {
  while (true) {
    let token = '';
    for (let i = 0; i < 6; i++) {
      token += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    const existing = await prisma.velorios.findUnique({ where: { token_acesso: token } });
    if (!existing) return token;
  }
}
