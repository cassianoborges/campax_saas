import { empresas as Empresa } from '@prisma/client';

export type EmpresaAtiva =
  | { tipo: 'empresa'; empresa: Empresa }
  /** Vários vínculos e nenhum escolhido: login provisório (só /auth/me, /auth/senha, /auth/empresa). */
  | { tipo: 'provisorio' }
  | { tipo: 'sem-vinculo' }
  /** O token aponta para uma empresa com a qual a pessoa não tem (mais) vínculo. */
  | { tipo: 'sem-acesso' };

/**
 * Which empresa a token acts for (spec 10). `emp` is the token's claim; without it, a single link is used.
 * If `emp` was suspended while the user has another active empresa, the session turns provisional so
 * they can pick another one (POST /auth/empresa) without logging in again.
 */
export function resolverEmpresaAtiva(vinculos: { empresa: Empresa }[], emp?: string): EmpresaAtiva {
  if (emp) {
    const vinculo = vinculos.find((v) => v.empresa.id === emp);
    if (!vinculo) return { tipo: 'sem-acesso' };
    if (!vinculo.empresa.ativo && vinculos.some((v) => v.empresa.ativo)) return { tipo: 'provisorio' };
    return { tipo: 'empresa', empresa: vinculo.empresa };
  }
  if (vinculos.length === 0) return { tipo: 'sem-vinculo' };
  if (vinculos.length === 1) return { tipo: 'empresa', empresa: vinculos[0].empresa };
  return { tipo: 'provisorio' };
}
