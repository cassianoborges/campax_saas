import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  sub: string;
  /** profiles.senha_alterada_em (ms) when the token was issued; absent = never changed. */
  sv?: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/** Session version of a profile: a token is valid only while it matches (a password change bumps it). */
export function sessaoVersao(profile: { senha_alterada_em: Date | null }): number | undefined {
  return profile.senha_alterada_em?.getTime();
}

export function tokenFor(profile: { id: string; senha_alterada_em: Date | null }): string {
  return signToken({ sub: profile.id, sv: sessaoVersao(profile) });
}
