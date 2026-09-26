import { randomUUID } from 'crypto';
import { Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { handleError, TENANT_ROLES } from '../lib/http';

// A superadmin manages the users of their own empresa (req.db scopes profiles). Roles are limited
// to the company ones — platform_admin can only be created by the create-platform-admin script.
export const usersRouter = Router();

usersRouter.use(tenantGuard('superadmin'));

function omitPasswordHash<T extends { password_hash?: string | null }>(profile: T) {
  const { password_hash, ...rest } = profile;
  return rest;
}

function isTenantRole(role: unknown): role is (typeof TENANT_ROLES)[number] {
  return typeof role === 'string' && (TENANT_ROLES as readonly string[]).includes(role);
}

usersRouter.get('/', async (req, res) => {
  try {
    const users = await req.db!.profiles.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ success: true, data: users.map(omitPasswordHash) });
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
    });
    res.json({ success: true, data: omitPasswordHash(user) });
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
      Object.assign(data, await novaSenha(password));
    }

    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: omitPasswordHash(user) });
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
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { role: req.body.role } });
    res.json({ success: true, data: omitPasswordHash(user) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.patch('/:id/active', async (req, res) => {
  try {
    if (req.params.id === req.profile!.id && !req.body.is_active) {
      return res.status(400).json({ success: false, error: 'Você não pode desativar o próprio usuário' });
    }
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { is_active: !!req.body.is_active } });
    res.json({ success: true, data: omitPasswordHash(user) });
  } catch (error) {
    handleError(res, error);
  }
});
