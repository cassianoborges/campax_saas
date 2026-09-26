import { Router } from 'express';
import { prisma } from '../prisma';
import { comparePassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { tokenFor } from '../auth/jwt';
import { VINCULOS_INCLUDE, requireAuth } from '../auth/middleware';
import { toEmpresaPublica, toEmpresaResumo } from '../lib/empresa';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password, empresa_slug } = req.body as { email?: string; password?: string; empresa_slug?: unknown };
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
    }

    const profile = await prisma.profiles.findUnique({ where: { email }, include: VINCULOS_INCLUDE });
    if (!profile || !profile.password_hash || !profile.is_active) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    const valid = await comparePassword(password, profile.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    const { password_hash, vinculos, ...safeProfile } = profile;
    const empresas = vinculos.map((v) => v.empresa);
    const slug = typeof empresa_slug === 'string' && empresa_slug ? empresa_slug.toLowerCase() : null;

    if (profile.role === 'platform_admin') {
      // On a funerária's subdomain only its own users may log in (spec 08): same answer as a wrong password.
      if (slug) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
      return res.json({ success: true, token: tokenFor(profile), profile: safeProfile, empresa: null, empresas: [] });
    }

    const escolhida = slug ? empresas.find((e) => e.slug === slug) : empresas.length === 1 ? empresas[0] : undefined;
    // Checked only after the password, so these answers reveal nothing about which e-mails exist.
    if (slug && !escolhida) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    if (empresas.length === 0) {
      return res.status(403).json({ success: false, error: 'Nenhuma empresa vinculada a este usuário' });
    }
    const lista = empresas.map(toEmpresaResumo);

    if (escolhida) {
      if (!escolhida.ativo) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
      return res.json({
        success: true, token: tokenFor(profile, escolhida.id), profile: safeProfile,
        empresa: toEmpresaPublica(escolhida), empresas: lista,
      });
    }
    // Several links on the generic address: provisional login, the user picks one (POST /auth/empresa).
    if (!empresas.some((e) => e.ativo)) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    res.json({ success: true, token: tokenFor(profile), profile: safeProfile, empresa: null, empresas: lista, escolher_empresa: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { password_hash, ...safeProfile } = req.profile!;
  res.json({
    success: true, profile: safeProfile, empresa: toEmpresaPublica(req.empresa),
    empresas: (req.vinculos ?? []).map(toEmpresaResumo),
  });
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
    res.json({ success: true, token: tokenFor(updated, req.empresa?.id) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Picks the active empresa after a provisional login, or switches it ("Trocar empresa").
authRouter.post('/empresa', requireAuth, async (req, res) => {
  const profile = req.profile!;
  if (profile.role === 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Rota disponível apenas para usuários de uma empresa' });
  }
  const empresa = (req.vinculos ?? []).find((e) => e.id === req.body?.empresa_id);
  if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
  if (!empresa.ativo) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
  console.log(`[auth] trocar-empresa usuario=${profile.id} empresa=${empresa.id}`);
  res.json({ success: true, token: tokenFor(profile, empresa.id), empresa: toEmpresaPublica(empresa) });
});
