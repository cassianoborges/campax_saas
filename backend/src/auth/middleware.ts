import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../prisma';
import { sessaoVersao, verifyToken } from './jwt';
import { Prisma, empresas as Empresa, profiles as Profile, user_role as UserRole } from '@prisma/client';
import { prismaForEmpresa, TenantPrisma } from '../tenant/prismaForEmpresa';
import { resolverEmpresaAtiva } from './empresaAtiva';

const ROLE_ORDER: Record<UserRole, number> = {
  platform_admin: 5,
  superadmin: 4,
  admin: 3,
  operador: 2,
  viewer: 1,
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      profile?: Profile;
      /** The caller's empresa — null for platform_admin. */
      empresa?: Empresa | null;
      /** Every empresa the user is linked to (spec 10); empty for platform_admin. */
      vinculos?: Empresa[];
      /** Prisma client scoped to req.empresa (set by tenantGuard). */
      db?: TenantPrisma;
    }
  }
}

/** profiles include with every linked empresa, oldest link first. */
export const VINCULOS_INCLUDE = {
  vinculos: { include: { empresa: true }, orderBy: { created_at: 'asc' } },
} satisfies Prisma.profilesInclude;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    const payload = verifyToken(token);
    // Links and empresas come from the DB on every request (not from the JWT), so unlinking a
    // user, suspending an empresa or changing the password takes effect immediately.
    const profile = await prisma.profiles.findUnique({ where: { id: payload.sub }, include: VINCULOS_INCLUDE });
    if (!profile || !profile.is_active) {
      return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }
    if (payload.sv !== sessaoVersao(profile)) {
      return res.status(401).json({ success: false, error: 'Sessão encerrada: a senha foi alterada' });
    }

    const { vinculos, ...rest } = profile;
    req.profile = rest;
    req.vinculos = vinculos.map((v) => v.empresa);
    if (rest.role === 'platform_admin') {
      req.empresa = null;
      return next();
    }

    const ativa = resolverEmpresaAtiva(vinculos, payload.emp);
    if (ativa.tipo === 'sem-vinculo') {
      return res.status(401).json({ success: false, error: 'Nenhuma empresa vinculada a este usuário' });
    }
    if (ativa.tipo === 'sem-acesso') {
      return res.status(401).json({ success: false, error: 'Você não tem mais acesso a esta empresa' });
    }
    if (ativa.tipo === 'empresa' && !ativa.empresa.ativo) {
      return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    }
    req.empresa = ativa.tipo === 'empresa' ? ativa.empresa : null;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

export function requireRole(required: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.profile?.role;
    if (!role || ROLE_ORDER[role] < ROLE_ORDER[required]) {
      return res.status(403).json({ success: false, error: 'Permissão insuficiente' });
    }
    next();
  };
}

/** Company routes: rejects platform_admin (who has no empresa) and scopes req.db to the caller's empresa. */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.empresa) {
    return res.status(403).json({ success: false, error: 'Rota disponível apenas para usuários de uma empresa' });
  }
  req.db = prismaForEmpresa(req.empresa.id);
  next();
}

/**
 * The one guard every company router uses: auth + empresa + minimum role.
 * requireTenant must run before requireRole — otherwise platform_admin (level 5) would pass any role check.
 */
export function tenantGuard(minRole: UserRole): RequestHandler[] {
  return [requireAuth, requireTenant, requireRole(minRole)];
}

export const requirePlatformAdmin: RequestHandler[] = [requireAuth, requireRole('platform_admin')];

export function hasRoleAtLeast(role: UserRole | undefined, required: UserRole): boolean {
  if (!role) return false;
  return ROLE_ORDER[role] >= ROLE_ORDER[required];
}
