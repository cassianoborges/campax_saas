import { Router } from 'express';
import { prisma } from '../prisma';
import { comparePassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { tokenFor } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';
import { toEmpresaPublica } from '../lib/empresa';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password, empresa_slug } = req.body as { email?: string; password?: string; empresa_slug?: unknown };
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
    }

    const profile = await prisma.profiles.findUnique({ where: { email }, include: { empresa: true } });
    if (!profile || !profile.password_hash || !profile.is_active) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    const valid = await comparePassword(password, profile.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    // On a funerária's subdomain (spec 08) only its own users may log in. Same answer as a wrong
    // password, and only after checking it, so this reveals nothing about the e-mail.
    if (typeof empresa_slug === 'string' && empresa_slug && profile.empresa?.slug !== empresa_slug.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    // Checked only after the password, so the message doesn't reveal which emails exist.
    if (profile.empresa && !profile.empresa.ativo) {
      return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    }

    const token = tokenFor(profile);
    const { password_hash, empresa, ...safeProfile } = profile;
    res.json({ success: true, token, profile: safeProfile, empresa: toEmpresaPublica(empresa) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { password_hash, ...safeProfile } = req.profile!;
  res.json({ success: true, profile: safeProfile, empresa: toEmpresaPublica(req.empresa) });
});

// Self-service password change. Errors are 400, not 401: the frontend treats 401 as "logged out".
authRouter.post('/senha', requireAuth, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = (req.body ?? {}) as { senha_atual?: unknown; nova_senha?: unknown };
    if (typeof senha_atual !== 'string' || typeof nova_senha !== 'string') {
      return res.status(400).json({ success: false, error: 'Informe a senha atual e a nova senha' });
    }
    const profile = req.profile!;
    if (!profile.password_hash || !(await comparePassword(senha_atual, profile.password_hash))) {
      return res.status(400).json({ success: false, error: 'Senha atual incorreta' });
    }
    if (nova_senha.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
    }
    if (nova_senha === senha_atual) {
      return res.status(400).json({ success: false, error: 'A nova senha precisa ser diferente da atual' });
    }

    const updated = await prisma.profiles.update({ where: { id: profile.id }, data: await novaSenha(nova_senha) });
    console.log(`[auth] trocar-senha usuario=${profile.id}`);
    // Every other session is now invalid; this one continues with a fresh token.
    res.json({ success: true, token: tokenFor(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
