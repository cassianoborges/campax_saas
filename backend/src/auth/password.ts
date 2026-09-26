import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Columns for a password change or reset: bumping senha_alterada_em ends every older session (see requireAuth). */
export async function novaSenha(plain: string) {
  return { password_hash: await hashPassword(plain), senha_alterada_em: new Date() };
}
