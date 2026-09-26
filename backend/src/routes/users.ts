import { randomUUID } from 'crypto';
import { Request, Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { handleError, isTenantRole } from '../lib/http';
import { assertNaoDeixaSemSuperadmin } from '../tenant/superadmins';

// A superadmin manages the users of their own empresa (req.db scopes profiles). Roles are limited
// to the company ones — platform_admin can only be created by the create-platform-admin script.
export const usersRouter = Router();

usersRouter.use(tenantGuard('superadmin'));

const MSG_COMPARTILHADO = 'Este usuário também atende outra empresa; fale com o suporte da Campax';
const COM_VINCULOS = { _count: { select: { vinculos: true } } } as const;

function serializar<T extends { password_hash?: string | null; _count: { vinculos: number } }>(profile: T) {
  const { password_hash, _count, ...rest } = profile;
  // How many other empresas this user serves — never which ones (spec 10, U4).
  return { ...rest, outras_empresas: _count.vinculos - 1 };
}

/** The user as seen by this empresa (404 if not linked to it), with the number of links. */
function usuario(req: Request, id: string) {
  return req.db!.profiles.findUniqueOrThrow({ where: { id }, include: COM_VINCULOS });
}

usersRouter.get('/', async (req, res) => {
  try {
    const users = await req.db!.profiles.findMany({ orderBy: { created_at: 'desc' }, include: COM_VINCULOS });
    res.json({ success: true, data: users.map(serializar) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.post('/', async (req, res) => {
  try {
    const { email, password, role, full_name, numero_whatsapp, agente_ia } = req.body as Record<string, any>;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
    }
    if (role !== undefined && !isTenantRole(role)) {
      return res.status(400).json({ success: false, error: 'Papel inválido' });
    }

    const password_hash = await hashPassword(password);
    const user = await req.db!.profiles.create({
      data: { id: randomUUID(), email, password_hash, role: role || 'viewer', full_name, numero_whatsapp, agente_ia: !!agente_ia } as any,
      include: COM_VINCULOS,
    });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error, { conflict: 'Já existe um usuário com esse email' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  try {
    const { password, full_name, numero_whatsapp, agente_ia } = req.body as Record<string, any>;
    const data: Record<string, any> = { full_name, numero_whatsapp, agente_ia };
    if (password) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ success: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
      }
      if (serializar(await usuario(req, req.params.id)).outras_empresas > 0) {
        return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
      }
      Object.assign(data, await novaSenha(password));
    }

    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.patch('/:id/role', async (req, res) => {
  try {
    if (!isTenantRole(req.body.role)) {
      return res.status(400).json({ success: false, error: 'Papel inválido' });
    }
    // Demoting yourself could leave the empresa without any superadmin.
    if (req.params.id === req.profile!.id && req.body.role !== 'superadmin') {
      return res.status(400).json({ success: false, error: 'Você não pode rebaixar o próprio papel' });
    }
    const atual = await usuario(req, req.params.id);
    if (serializar(atual).outras_empresas > 0) return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
    if (atual.role === 'superadmin' && atual.is_active && req.body.role !== 'superadmin') {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { role: req.body.role }, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.patch('/:id/active', async (req, res) => {
  try {
    const is_active = !!req.body.is_active;
    if (req.params.id === req.profile!.id && !is_active) {
      return res.status(400).json({ success: false, error: 'Você não pode desativar o próprio usuário' });
    }
    const atual = await usuario(req, req.params.id);
    if (serializar(atual).outras_empresas > 0) return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
    if (!is_active && atual.role === 'superadmin' && atual.is_active) {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { is_active }, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

// Removes the user from this empresa only (spec 10, U4). With no link left, they can't log in.
usersRouter.delete('/:id/vinculo', async (req, res) => {
  try {
    if (req.params.id === req.profile!.id) {
      return res.status(400).json({ success: false, error: 'Você não pode remover o próprio usuário da empresa' });
    }
    const atual = await usuario(req, req.params.id);
    if (atual.role === 'superadmin' && atual.is_active) {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    await req.db!.usuario_empresas.deleteMany({ where: { profile_id: atual.id } });
    console.log(`[users] remover-da-empresa usuario=${atual.id} empresa=${req.empresa!.id} por=${req.profile!.id}`);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
