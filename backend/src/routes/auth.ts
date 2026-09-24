import { Router } from 'express';
import { prisma } from '../prisma';
import { comparePassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';
import { toEmpresaPublica } from '../lib/empresa';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
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
    // Checked only after the password, so the message doesn't reveal which emails exist.
    if (profile.empresa && !profile.empresa.ativo) {
      return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    }

    const token = signToken({ sub: profile.id });
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
