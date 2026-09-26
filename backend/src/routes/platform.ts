import fs from 'fs';
import path from 'path';
import { randomInt, randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { isReservedSlug } from '../lib/empresaHost';
import { requirePlatformAdmin } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { handleError, pick, TEMPLATE_FIELDS, TENANT_ROLES } from '../lib/http';
import { UPLOADS_DIR } from '../lib/uploads';
import { notifyMediamtxSync } from '../lib/mediamtxSync';

// Platform panel (spec docs/multiempresa/04-plataforma.md). Only platform_admin; uses the raw
// prisma client on purpose — it works across empresas. There is no route that creates or
// promotes a platform_admin (that's the create-platform-admin script only).
export const platformRouter = Router();

platformRouter.use(...requirePlatformAdmin);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COR_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

// slug and hash_publico are immutable after creation (P1): the hash is in printed links/QR codes,
// the slug in MediaMTX paths and (later) subdomains.
const EMPRESA_EDITABLE = [
  'nome', 'nome_exibicao', 'cnpj', 'whatsapp_contato', 'email_contato', 'cor_primaria', 'cor_secundaria', 'telefone',
  'endereco_cep', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento', 'endereco_bairro', 'endereco_cidade', 'endereco_uf',
] as const;
// Optional free-text fields: trimmed, blank → null.
const EMPRESA_OPCIONAIS = [
  'telefone', 'endereco_cep', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento', 'endereco_bairro', 'endereco_cidade', 'endereco_uf',
] as const;

// Never generate a hash equal to a first-level frontend route (/admin/x, /platform/x, /velorio/x).
const RESERVED_HASHES = new Set(['admin', 'platform', 'velorio']);
const HASH_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function log(req: Request, acao: string, empresaId?: string, extra = '') {
  console.log(`[platform] ${acao}${empresaId ? ` empresa=${empresaId}` : ''} por=${req.profile!.id}${extra ? ` ${extra}` : ''}`);
}

function bad(res: Response, error: string) {
  return res.status(400).json({ success: false, error });
}

function omitPasswordHash<T extends { password_hash?: string | null }>(profile: T) {
  const { password_hash, ...rest } = profile;
  return rest;
}

/** Slug suggestion from a name: "Funerária São José" → "funeraria-sao-jose". */
export function slugify(nome: string) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

async function generateHashPublico(): Promise<string> {
  for (;;) {
    const hash = Array.from({ length: 8 }, () => HASH_CHARS[randomInt(HASH_CHARS.length)]).join('');
    if (RESERVED_HASHES.has(hash)) continue;
    if (!(await prisma.empresas.findUnique({ where: { hash_publico: hash }, select: { id: true } }))) return hash;
  }
}

/** Validates the editable empresa fields; returns an error message or null. */
function validateEmpresaFields(fields: Partial<Record<(typeof EMPRESA_EDITABLE)[number], any>>): string | null {
  for (const cor of ['cor_primaria', 'cor_secundaria'] as const) {
    if (fields[cor] === '') fields[cor] = null;
    if (fields[cor] != null && !COR_RE.test(fields[cor])) return `Cor inválida (${cor}): use o formato #RRGGBB`;
  }
  for (const key of ['nome', 'nome_exibicao'] as const) {
    if (key in fields && !String(fields[key] ?? '').trim()) return `O campo ${key} é obrigatório`;
  }
  if (fields.email_contato && !EMAIL_RE.test(fields.email_contato)) return 'E-mail de contato inválido';
  for (const key of EMPRESA_OPCIONAIS) {
    if (!(key in fields)) continue;
    const value = fields[key] == null ? '' : String(fields[key]).trim();
    fields[key] = value || null;
  }
  if (fields.endereco_cep) {
    const digitos = fields.endereco_cep.replace(/\D/g, '');
    if (digitos.length !== 8) return 'CEP inválido: use 8 dígitos';
    fields.endereco_cep = `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
  }
  if (fields.endereco_uf) {
    fields.endereco_uf = fields.endereco_uf.toUpperCase();
    if (!UFS.has(fields.endereco_uf)) return 'UF inválida';
  }
  return null;
}

/** Usage counts per empresa, in a handful of grouped queries (not one per empresa). */
async function usoPorEmpresa(empresaIds?: string[]) {
  const where = empresaIds ? { empresa_id: { in: empresaIds } } : {};
  const now = new Date();
  const trintaDias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [usuarios, cameras, salas, velorios, aoVivo, acessos] = await Promise.all([
    prisma.profiles.groupBy({ by: ['empresa_id'], where: { ...where, empresa_id: empresaIds ? { in: empresaIds } : { not: null } }, _count: true }),
    prisma.cameras.groupBy({ by: ['empresa_id'], where, _count: true }),
    prisma.sala_velorio.groupBy({ by: ['empresa_id'], where, _count: true }),
    prisma.velorios.groupBy({ by: ['empresa_id'], where, _count: true }),
    prisma.velorios.groupBy({ by: ['empresa_id'], where: { ...where, data_inicio: { lte: now }, data_fim: { gte: now } }, _count: true }),
    prisma.velorio_access_logs.groupBy({ by: ['empresa_id'], where: { ...where, accessed_at: { gte: trintaDias } }, _count: true }),
  ]);
  const toMap = (rows: { empresa_id: string | null; _count: number }[]) => new Map(rows.map((r) => [r.empresa_id, r._count]));
  const maps = {
    usuarios: toMap(usuarios), cameras: toMap(cameras), salas: toMap(salas),
    velorios: toMap(velorios), velorios_ao_vivo: toMap(aoVivo), acessos_30d: toMap(acessos),
  };
  return (empresaId: string) =>
    Object.fromEntries(Object.entries(maps).map(([key, map]) => [key, map.get(empresaId) ?? 0])) as Record<keyof typeof maps, number>;
}

// ---------------------------------------------------------------------------------------------
// Empresas

platformRouter.get('/empresas', async (_req, res) => {
  try {
    const empresas = await prisma.empresas.findMany({ orderBy: { created_at: 'asc' } });
    const uso = await usoPorEmpresa();
    res.json({ success: true, data: empresas.map((e) => ({ ...e, uso: uso(e.id) })) });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.get('/empresas/:id', async (req, res) => {
  try {
    const empresa = await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.id } });
    const uso = await usoPorEmpresa([empresa.id]);
    res.json({ success: true, data: { ...empresa, uso: uso(empresa.id) } });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.post('/empresas', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { empresa?: Record<string, unknown>; superadmin?: Record<string, string> };
    const fields = pick(body.empresa, EMPRESA_EDITABLE);
    const invalid = validateEmpresaFields(fields);
    if (invalid) return bad(res, invalid);
    if (!fields.nome || !fields.nome_exibicao) return bad(res, 'Nome e nome de exibição são obrigatórios');

    const slug = String(body.empresa?.slug || slugify(String(fields.nome))).trim();
    if (!SLUG_RE.test(slug) || slug.length > 40) {
      return bad(res, 'Slug inválido: use letras minúsculas, números e hífens (máx. 40)');
    }
    if (isReservedSlug(slug)) return bad(res, 'Esse identificador é reservado');

    const email = body.superadmin?.email?.trim().toLowerCase();
    const password = body.superadmin?.password ?? '';
    if (!email || !EMAIL_RE.test(email)) return bad(res, 'E-mail do superadmin inválido');
    if (password.length < MIN_PASSWORD_LENGTH) return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);

    const hash_publico = await generateHashPublico();
    const password_hash = await hashPassword(password);

    // Empresa and first superadmin together (P3): a duplicate e-mail or slug creates nothing.
    const empresa = await prisma.$transaction(async (tx) => {
      const created = await tx.empresas.create({ data: { ...fields, nome: fields.nome, nome_exibicao: fields.nome_exibicao, slug, hash_publico } });
      await tx.profiles.create({
        data: {
          id: randomUUID(), email, password_hash, role: 'superadmin',
          full_name: body.superadmin?.full_name || null, empresa_id: created.id,
        },
      });
      return created;
    });

    log(req, 'criar-empresa', empresa.id, `slug=${slug} superadmin=${email}`);
    res.json({ success: true, data: empresa });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String((error.meta as { target?: unknown })?.target ?? '');
      const msg = target.includes('email') ? 'Já existe um usuário com esse e-mail' : 'Já existe uma empresa com esse slug';
      return res.status(409).json({ success: false, error: msg });
    }
    handleError(res, error);
  }
});

platformRouter.patch('/empresas/:id', async (req, res) => {
  try {
    const fields = pick(req.body, EMPRESA_EDITABLE);
    const invalid = validateEmpresaFields(fields);
    if (invalid) return bad(res, invalid);
    const empresa = await prisma.empresas.update({ where: { id: req.params.id }, data: fields });
    log(req, 'editar-empresa', empresa.id, Object.keys(fields).join(','));
    res.json({ success: true, data: empresa });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.patch('/empresas/:id/ativo', async (req, res) => {
  try {
    const ativo = !!req.body?.ativo;
    const empresa = await prisma.empresas.update({ where: { id: req.params.id }, data: { ativo } });
    const now = new Date();
    const velorios_ao_vivo = await prisma.velorios.count({
      where: { empresa_id: empresa.id, data_inicio: { lte: now }, data_fim: { gte: now } },
    });
    log(req, ativo ? 'reativar-empresa' : 'suspender-empresa', empresa.id, `ao_vivo=${velorios_ao_vivo}`);
    // A suspended empresa's cameras leave MediaMTX; reactivated ones come back under the same paths.
    notifyMediamtxSync(ativo ? 'empresa reativada' : 'empresa suspensa');
    res.json({ success: true, data: empresa, velorios_ao_vivo });
  } catch (error) {
    handleError(res, error);
  }
});

// Logo: PNG/JPG/WEBP up to 2 MB (P5). No SVG — it is served from /files and could carry script.
const LOGO_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in LOGO_TYPES),
}).single('file');

platformRouter.post('/empresas/:id/logo', (req, res) => {
  uploadLogo(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        const tooBig = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
        return bad(res, tooBig ? 'O logo pode ter no máximo 2 MB' : 'Falha no envio do arquivo');
      }
      if (!req.file) return bad(res, 'Envie uma imagem PNG, JPG ou WEBP');

      const empresa = await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true } });
      // Timestamped name: a new logo never collides with a cached old one.
      const fileName = `logo-${Date.now()}${LOGO_TYPES[req.file.mimetype]}`;
      const dir = path.join(UPLOADS_DIR, empresa.id, 'branding');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), req.file.buffer);

      const logo_url = `${req.protocol}://${req.get('host')}/files/${empresa.id}/branding/${fileName}`;
      const updated = await prisma.empresas.update({ where: { id: empresa.id }, data: { logo_url } });
      log(req, 'logo-empresa', empresa.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      handleError(res, error);
    }
  });
});

platformRouter.delete('/empresas/:id/logo', async (req, res) => {
  try {
    const empresa = await prisma.empresas.update({ where: { id: req.params.id }, data: { logo_url: null } });
    log(req, 'remover-logo', empresa.id);
    res.json({ success: true, data: empresa });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------------------------------------------------------------------------------------------
// Users of an empresa (support: create, reset password, activate/deactivate)

function isTenantRole(role: unknown): role is (typeof TENANT_ROLES)[number] {
  return typeof role === 'string' && (TENANT_ROLES as readonly string[]).includes(role);
}

async function usuarioDaEmpresa(empresaId: string, userId: string) {
  return prisma.profiles.findFirstOrThrow({ where: { id: userId, empresa_id: empresaId } });
}

platformRouter.get('/empresas/:id/usuarios', async (req, res) => {
  try {
    await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true } });
    const users = await prisma.profiles.findMany({ where: { empresa_id: req.params.id }, orderBy: { created_at: 'asc' } });
    res.json({ success: true, data: users.map(omitPasswordHash) });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.post('/empresas/:id/usuarios', async (req, res) => {
  try {
    const { email: rawEmail, password, role, full_name } = (req.body ?? {}) as Record<string, string>;
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return bad(res, 'E-mail inválido');
    if (!password || password.length < MIN_PASSWORD_LENGTH) return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    if (!isTenantRole(role)) return bad(res, 'Papel inválido');

    await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true } });
    const user = await prisma.profiles.create({
      data: { id: randomUUID(), email, password_hash: await hashPassword(password), role, full_name: full_name || null, empresa_id: req.params.id },
    });
    log(req, 'criar-usuario', req.params.id, `usuario=${user.id} papel=${role}`);
    res.json({ success: true, data: omitPasswordHash(user) });
  } catch (error) {
    handleError(res, error, { conflict: 'Já existe um usuário com esse e-mail' });
  }
});

platformRouter.patch('/empresas/:id/usuarios/:uid/senha', async (req, res) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    const user = await usuarioDaEmpresa(req.params.id, req.params.uid);
    await prisma.profiles.update({ where: { id: user.id }, data: await novaSenha(password) });
    log(req, 'redefinir-senha', req.params.id, `usuario=${user.id}`);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.patch('/empresas/:id/usuarios/:uid/ativo', async (req, res) => {
  try {
    const is_active = !!req.body?.is_active;
    const user = await usuarioDaEmpresa(req.params.id, req.params.uid);
    if (!is_active && user.role === 'superadmin' && user.is_active) {
      const outros = await prisma.profiles.count({
        where: { empresa_id: req.params.id, role: 'superadmin', is_active: true, id: { not: user.id } },
      });
      if (outros === 0) return bad(res, 'Não é possível desativar o último superadmin ativo da empresa');
    }
    const updated = await prisma.profiles.update({ where: { id: user.id }, data: { is_active } });
    log(req, is_active ? 'ativar-usuario' : 'desativar-usuario', req.params.id, `usuario=${user.id}`);
    res.json({ success: true, data: omitPasswordHash(updated) });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------------------------------------------------------------------------------------------
// Global homenagem templates (empresa_id NULL, D6) — read-only for the empresas.

const GLOBAL = { empresa_id: null };

platformRouter.get('/homenagens-templates', async (_req, res) => {
  try {
    const templates = await prisma.homenagens_templates.findMany({ where: GLOBAL, orderBy: { titulo: 'asc' } });
    res.json({ success: true, data: templates });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.post('/homenagens-templates', async (req, res) => {
  try {
    const fields = pick(req.body, TEMPLATE_FIELDS);
    if (!fields.titulo || !fields.mensagem) return bad(res, 'Título e mensagem são obrigatórios');
    const template = await prisma.homenagens_templates.create({ data: { titulo: fields.titulo, mensagem: fields.mensagem, empresa_id: null } });
    log(req, 'criar-modelo-global');
    res.json({ success: true, data: template });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.patch('/homenagens-templates/:id', async (req, res) => {
  try {
    const template = await prisma.homenagens_templates.update({ where: { id: req.params.id, ...GLOBAL }, data: pick(req.body, TEMPLATE_FIELDS) });
    res.json({ success: true, data: template });
  } catch (error) {
    handleError(res, error);
  }
});

platformRouter.delete('/homenagens-templates/:id', async (req, res) => {
  try {
    await prisma.homenagens_templates.delete({ where: { id: req.params.id, ...GLOBAL } });
    log(req, 'remover-modelo-global');
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
