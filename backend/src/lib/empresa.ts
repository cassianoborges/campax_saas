import { Prisma } from '@prisma/client';

/** Fields of an empresa that the frontend (admin and public pages) may see. */
export const EMPRESA_PUBLIC_SELECT = {
  id: true,
  nome_exibicao: true,
  slug: true,
  hash_publico: true,
  logo_url: true,
  cor_primaria: true,
  cor_secundaria: true,
  whatsapp_contato: true,
  email_contato: true,
} satisfies Prisma.empresasSelect;

export type EmpresaPublica = Prisma.empresasGetPayload<{ select: typeof EMPRESA_PUBLIC_SELECT }>;

export function toEmpresaPublica<T extends Record<string, unknown>>(empresa: T | null | undefined): EmpresaPublica | null {
  if (!empresa) return null;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(EMPRESA_PUBLIC_SELECT)) result[key] = empresa[key];
  return result as EmpresaPublica;
}

/** An empresa in a user's list (login, /auth/me): public fields plus whether it can be chosen. */
export type EmpresaResumo = EmpresaPublica & { ativo: boolean };

export function toEmpresaResumo(empresa: Record<string, unknown> & { ativo: boolean }): EmpresaResumo {
  return { ...(toEmpresaPublica(empresa) as EmpresaPublica), ativo: empresa.ativo };
}
