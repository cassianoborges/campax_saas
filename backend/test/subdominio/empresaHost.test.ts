import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/prisma';
import { resetDb, createEmpresa } from '../helpers';
import {
  CACHE_MAX_ENTRIES, clearEmpresaOriginCache, empresaOriginCacheSize, isEmpresaOrigin, isReservedSlug,
  parseEmpresaOrigin,
} from '../../src/lib/empresaHost';

beforeEach(async () => {
  process.env.BASE_DOMAIN = 'campax.com.br';
  clearEmpresaOriginCache();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe('parseEmpresaOrigin', () => {
  it('aceita https://<slug>.<base> e devolve o slug em minúsculas', () => {
    expect(parseEmpresaOrigin('https://funeraria-x.campax.com.br')).toBe('funeraria-x');
    expect(parseEmpresaOrigin('https://Funeraria-X.Campax.com.br')).toBe('funeraria-x');
  });

  it.each([
    'http://funeraria-x.campax.com.br',
    'https://funeraria-x.campax.com.br:8443',
    'https://funeraria-x.campax.com.br/admin',
    'https://a.b.campax.com.br',
    'https://x.campax.com.br.evil.com',
    'https://xcampax.com.br',
    'https://campax.com.br',
    'https://app2.campax.com.br',
    'https://-x.campax.com.br',
    'https://x_y.campax.com.br',
    `https://${'a'.repeat(41)}.campax.com.br`,
    'null',
    '',
  ])('recusa %s', (origin) => {
    expect(parseEmpresaOrigin(origin)).toBeNull();
  });

  it('BASE_DOMAIN vazio recusa tudo', () => {
    process.env.BASE_DOMAIN = '';
    expect(parseEmpresaOrigin('https://funeraria-x.campax.com.br')).toBeNull();
  });
});

describe('isReservedSlug', () => {
  it('reconhece nomes de infraestrutura', () => {
    for (const s of ['app2', 'backend', 'media2', 'apicam', 'www', 'admin', 'platform']) expect(isReservedSlug(s)).toBe(true);
    expect(isReservedSlug('funeraria-x')).toBe(false);
  });
});

describe('isEmpresaOrigin', () => {
  it('empresa ativa → true; inexistente ou suspensa → false', async () => {
    const ativa = await createEmpresa();
    const suspensa = await createEmpresa({ ativo: false });
    expect(await isEmpresaOrigin(`https://${ativa.slug}.campax.com.br`)).toBe(true);
    expect(await isEmpresaOrigin(`https://${suspensa.slug}.campax.com.br`)).toBe(false);
    expect(await isEmpresaOrigin('https://naoexiste.campax.com.br')).toBe(false);
  });

  it('guarda o resultado em cache (suspender só vale depois do cache expirar)', async () => {
    const empresa = await createEmpresa();
    const origin = `https://${empresa.slug}.campax.com.br`;
    expect(await isEmpresaOrigin(origin)).toBe(true);
    await prisma.empresas.update({ where: { id: empresa.id }, data: { ativo: false } });
    expect(await isEmpresaOrigin(origin)).toBe(true);
    clearEmpresaOriginCache();
    expect(await isEmpresaOrigin(origin)).toBe(false);
  });

  it('origens inventadas não fazem o cache crescer sem limite', async () => {
    for (let i = 0; i < CACHE_MAX_ENTRIES + 50; i++) await isEmpresaOrigin(`https://falsa${i}.campax.com.br`);
    expect(empresaOriginCacheSize()).toBeLessThanOrEqual(CACHE_MAX_ENTRIES);
  });
});
