import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { clearEmpresaOriginCache } from '../../src/lib/empresaHost';
import { resetDb } from '../helpers';
import { duasEmpresas, Fixture } from '../isolamento/fixture';

let f: Fixture;

beforeEach(async () => {
  process.env.BASE_DOMAIN = 'campax.com.br';
  clearEmpresaOriginCache();
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

const ACAO = 'access-control-allow-origin';

describe('CORS', () => {
  it('aceita o subdomínio de uma empresa ativa', async () => {
    const origin = `https://${f.A.empresa.slug}.campax.com.br`;
    const res = await request(app).get('/health').set('Origin', origin);
    expect(res.headers[ACAO]).toBe(origin);
  });

  it('continua aceitando FRONTEND_ORIGIN', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:8080');
    expect(res.headers[ACAO]).toBe('http://localhost:8080');
  });

  it('recusa slug inexistente, empresa suspensa e http://', async () => {
    await prisma.empresas.update({ where: { id: f.B.empresa.id }, data: { ativo: false } });
    for (const origin of [
      'https://naoexiste.campax.com.br',
      `https://${f.B.empresa.slug}.campax.com.br`,
      `http://${f.A.empresa.slug}.campax.com.br`,
    ]) {
      const res = await request(app).get('/health').set('Origin', origin);
      expect(res.headers[ACAO]).toBeUndefined();
    }
  });

  it('preflight de subdomínio válido responde com os cabeçalhos', async () => {
    const origin = `https://${f.A.empresa.slug}.campax.com.br`;
    const res = await request(app).options('/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers[ACAO]).toBe(origin);
  });
});
