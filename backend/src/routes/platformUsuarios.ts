import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePlatformAdmin } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { EMAIL_RE, handleError, isTenantRole, TENANT_ROLES } from '../lib/http';

type TenantRole = (typeof TENANT_ROLES)[number];
import { assertNaoDeixaSemSuperadmin } from '../tenant/superadmins';

// Global user registry of the platform (spec docs/multiempresa/10-usuarios-globais.md). Only
// platform_admin; raw prisma on purpose (works across empresas). platform_admin accounts are never
// listed, edited or linked here.
export const platformUsuariosRouter = Router();

platformUsuariosRouter.use(...requirePlatformAdmin);

const USUARIO_INCLUDE = {
  vinculos: {
    include: { empresa: { select: { id: true, nome_exibicao: true, slug: true, ativo: true } } },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.profilesInclude;
type UsuarioComVinculos = Prisma.profilesGetPayload<{ include: typeof USUARIO_INCLUDE }>;

function serializar(user: UsuarioComVinculos) {
  const { password_hash, senha_alterada_em, vinculos, ...rest } = user;
  return { ...rest, empresas: vinculos.map((v) => v.empresa) };
}

function bad(res: Response, error: string) {
  return res.status(400).json({ success: false, error });
}

function log(req: Request, acao: string, usuarioId: string, extra = '') {
  console.log(`[platform] ${acao} usuario=${usuarioId}${extra ? ` ${extra}` : ''} por=${req.profile!.id}`);
}

const NAO_PLATFORM_ADMIN = { role: { not: 'platform_admin' } } satisfies Prisma.profilesWhereInput;

function carregar(id: string) {
  return prisma.profiles.findFirstOrThrow({ where: { id, ...NAO_PLATFORM_ADMIN }, include: USUARIO_INCLUDE });
}

/** Empresas where this user is the active superadmin that U8 must protect (all of them). */
const empresasDe = (user: UsuarioComVinculos) => user.vinculos.map((v) => v.empresa_id);
const ehSuperadminAtivo = (user: UsuarioComVinculos) => user.role === 'superadmin' && user.is_active;

platformUsuariosRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const empresaId = typeof req.query.empresa_id === 'string' ? req.query.empresa_id : '';
    const where: Prisma.profilesWhereInput = {
      ...NAO_PLATFORM_ADMIN,
      ...(busca && {
        OR: [
          { email: { contains: busca, mode: 'insensitive' } },
          { full_name: { contains: busca, mode: 'insensitive' } },
        ],
      }),
      ...(empresaId === 'nenhuma' ? { vinculos: { none: {} } } : empresaId ? { vinculos: { some: { empresa_id: empresaId } } } : {}),
    };
    const users = await prisma.profiles.findMany({ where, include: USUARIO_INCLUDE, orderBy: { created_at: 'asc' } });
    res.json({ success: true, data: users.map(serializar) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.post('/', async (req, res) => {
  try {
    const { email: rawEmail, password, role, full_name, empresa_ids } = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return bad(res, 'E-mail inválido');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
    if (!isTenantRole(role)) return bad(res, 'Papel inválido');
    if (empresa_ids !== undefined && (!Array.isArray(empresa_ids) || empresa_ids.some((id) => typeof id !== 'string'))) {
      return bad(res, 'Lista de empresas inválida');
    }
    const ids = [...new Set((empresa_ids as string[] | undefined) ?? [])];
    if (ids.length && (await prisma.empresas.count({ where: { id: { in: ids } } })) !== ids.length) {
      return bad(res, 'Empresa não encontrada');
    }

    const user = await prisma.profiles.create({
      data: {
        id: randomUUID(), email, password_hash: await hashPassword(password), role,
        full_name: typeof full_name === 'string' && full_name.trim() ? full_name.trim() : null,
        vinculos: { create: ids.map((empresa_id) => ({ empresa_id, created_by: req.profile!.id })) },
      },
      include: USUARIO_INCLUDE,
    });
    log(req, 'criar-usuario-global', user.id, `papel=${role} empresas=${ids.join(',') || '-'}`);
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error, { conflict: 'Já existe um usuário com esse e-mail' });
  }
});

platformUsuariosRouter.get('/:id', async (req, res) => {
  try {
    res.json({ success: true, data: serializar(await carregar(req.params.id)) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id', async (req, res) => {
  try {
    const { full_name, role } = (req.body ?? {}) as Record<string, unknown>;
    if (role !== undefined && !isTenantRole(role)) return bad(res, 'Papel inválido');
    const user = await carregar(req.params.id);
    const data: Prisma.profilesUpdateInput = {};
    if (typeof full_name === 'string') data.full_name = full_name.trim() || null;
    if (role !== undefined) data.role = role as TenantRole;
    const updated = await prisma.$transaction(async (tx) => {
      if (role !== undefined && role !== 'superadmin' && ehSuperadminAtivo(user)) {
        await assertNaoDeixaSemSuperadmin(tx, user.id, empresasDe(user));
      }
      return tx.profiles.update({ where: { id: user.id }, data, include: USUARIO_INCLUDE });
    });
    log(req, 'editar-usuario', user.id, role !== undefined ? `papel=${role}` : '');
    res.json({ success: true, data: serializar(updated) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id/senha', async (req, res) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    const user = await carregar(req.params.id);
    await prisma.profiles.update({ where: { id: user.id }, data: await novaSenha(password) });
    log(req, 'redefinir-senha', user.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id/ativo', async (req, res) => {
  try {
    const is_active = !!req.body?.is_active;
    const user = await carregar(req.params.id);
    const updated = await prisma.$transaction(async (tx) => {
      if (!is_active && ehSuperadminAtivo(user)) await assertNaoDeixaSemSuperadmin(tx, user.id, empresasDe(user));
      return tx.profiles.update({ where: { id: user.id }, data: { is_active }, include: USUARIO_INCLUDE });
    });
    log(req, is_active ? 'ativar-usuario' : 'desativar-usuario', user.id);
    res.json({ success: true, data: serializar(updated) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.put('/:id/empresas/:empresaId', async (req, res) => {
  try {
    const user = await carregar(req.params.id);
    await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.empresaId }, select: { id: true } });
    await prisma.usuario_empresas.upsert({
      where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: req.params.empresaId } },
      create: { profile_id: user.id, empresa_id: req.params.empresaId, created_by: req.profile!.id },
      update: {},
    });
    log(req, 'vincular', user.id, `empresa=${req.params.empresaId}`);
    res.json({ success: true, data: serializar(await carregar(user.id)) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.delete('/:id/empresas/:empresaId', async (req, res) => {
  try {
    const user = await carregar(req.params.id);
    if (!user.vinculos.some((v) => v.empresa_id === req.params.empresaId)) {
      return res.status(404).json({ success: false, error: 'Não encontrado' });
    }
    await prisma.$transaction(async (tx) => {
      if (ehSuperadminAtivo(user)) await assertNaoDeixaSemSuperadmin(tx, user.id, [req.params.empresaId]);
      await tx.usuario_empresas.delete({
        where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: req.params.empresaId } },
      });
    });
    log(req, 'desvincular', user.id, `empresa=${req.params.empresaId}`);
    res.json({ success: true, data: serializar(await carregar(user.id)) });
  } catch (error) {
    handleError(res, error);
  }
});
