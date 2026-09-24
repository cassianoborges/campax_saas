import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { clearEmpresaOriginCache } from '../../src/lib/empresaHost';
import { resetDb, TEST_PASSWORD } from '../helpers';
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

describe('rotas públicas por slug', () => {
  it('marca da empresa por slug: mesmos campos da rota por hash', async () => {
    const porSlug = await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}`);
    const porHash = await request(app).get(`/public/empresas/${f.A.empresa.hash_publico}`);
    expect(porSlug.status).toBe(200);
    expect(porSlug.body.data).toEqual(porHash.body.data);
  });

  it('empresa suspensa, inexistente ou slug reservado → 404', async () => {
    await prisma.empresas.update({ where: { id: f.B.empresa.id }, data: { ativo: false } });
    for (const slug of [f.B.empresa.slug, 'naoexiste', 'app2']) {
      expect((await request(app).get(`/public/empresas/slug/${slug}`)).status).toBe(404);
      expect((await request(app).get(`/public/empresas/slug/${slug}/salas/sala-1`)).status).toBe(404);
    }
  });

  it('sala por slug da empresa: cada empresa vê a sua sala-1', async () => {
    const a = await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}/salas/sala-1`);
    const b = await request(app).get(`/public/empresas/slug/${f.B.empresa.slug}/salas/sala-1`);
    expect(a.status).toBe(200);
    expect(a.body.data.sala.id).toBe(f.A.sala.id);
    expect(a.body.data.atual.id).toBe(f.A.velorio.id);
    expect(b.body.data.sala.id).toBe(f.B.sala.id);
  });

  it('sala inexistente na empresa → 404', async () => {
    expect((await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}/salas/nao-existe`)).status).toBe(404);
  });
});

describe('token com ?empresa=', () => {
  it('mesma empresa → 200; outra empresa → 404 igual a token inexistente; sem parâmetro → como antes', async () => {
    const token = f.A.velorio.token_acesso;
    expect((await request(app).get(`/public/velorios/${token}?empresa=${f.A.empresa.slug}`)).status).toBe(200);
    const outra = await request(app).get(`/public/velorios/${token}?empresa=${f.B.empresa.slug}`);
    const inexistente = await request(app).get('/public/velorios/ZZZZZZ');
    expect(outra.status).toBe(404);
    expect(outra.body).toEqual(inexistente.body);
    expect((await request(app).get(`/public/velorios/${token}`)).status).toBe(200);
  });

  it('slug em maiúsculas é normalizado', async () => {
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}?empresa=${f.A.empresa.slug.toUpperCase()}`);
    expect(res.status).toBe(200);
  });
});

describe('login com empresa_slug', () => {
  const login = (email: string, empresa_slug?: string) =>
    request(app).post('/auth/login').send({ email, password: TEST_PASSWORD, empresa_slug });

  it('usuário da mesma empresa entra', async () => {
    const res = await login(f.A.users.admin.email, f.A.empresa.slug);
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(f.A.empresa.id);
  });

  it('usuário de outra empresa e platform_admin: 401 igual a senha errada', async () => {
    const senhaErrada = await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: 'errada', empresa_slug: f.A.empresa.slug });
    for (const email of [f.B.users.admin.email, f.platformAdmin.email]) {
      const res = await login(email, f.A.empresa.slug);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(senhaErrada.body);
    }
  });

  it('senha errada continua 401 mesmo com a empresa certa', async () => {
    const res = await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: 'errada', empresa_slug: f.A.empresa.slug });
    expect(res.status).toBe(401);
  });

  it('sem empresa_slug: como antes (qualquer empresa e platform_admin)', async () => {
    expect((await login(f.B.users.admin.email)).status).toBe(200);
    expect((await login(f.platformAdmin.email)).status).toBe(200);
  });

  it('empresa_slug em maiúsculas é normalizado', async () => {
    expect((await login(f.A.users.admin.email, f.A.empresa.slug.toUpperCase())).status).toBe(200);
  });
});
