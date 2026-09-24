import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { resetDb, TEST_PASSWORD } from '../helpers';
import { duasEmpresas, Fixture } from './fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

describe('papéis', () => {
  it.each(['/cameras', '/salas', '/velorios', '/users', '/access-logs', '/homenagens-templates'])(
    'platform_admin em %s → 403',
    async (rota) => {
      const res = await request(app).get(rota).set(f.as(f.platformAdmin));
      expect(res.status).toBe(403);
    },
  );

  it('superadmin não cria nem promove platform_admin', async () => {
    const h = f.as(f.A.users.superadmin);
    const criar = await request(app).post('/users').set(h).send({ email: 'x@example.com', password: '12345678', role: 'platform_admin' });
    expect(criar.status).toBe(400);
    const promover = await request(app).patch(`/users/${f.A.users.viewer.id}/role`).set(h).send({ role: 'platform_admin' });
    expect(promover.status).toBe(400);
  });

  it('usuário criado por superadmin de A fica em A', async () => {
    const res = await request(app).post('/users').set(f.as(f.A.users.superadmin)).send({ email: 'novo@example.com', password: '12345678', role: 'operador' });
    expect(res.status).toBe(200);
    expect(res.body.data.empresa_id).toBe(f.A.empresa.id);
  });

  it('superadmin não desativa nem rebaixa a si mesmo', async () => {
    const eu = f.A.users.superadmin;
    expect((await request(app).patch(`/users/${eu.id}/active`).set(f.as(eu)).send({ is_active: false })).status).toBe(400);
    expect((await request(app).patch(`/users/${eu.id}/role`).set(f.as(eu)).send({ role: 'admin' })).status).toBe(400);
  });

  it('modelo global é somente leitura para a empresa', async () => {
    const h = f.as(f.A.users.admin);
    expect((await request(app).patch(`/homenagens-templates/${f.templateGlobal.id}`).set(h).send({ titulo: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/homenagens-templates/${f.templateGlobal.id}`).set(h)).status).toBe(404);
  });
});

describe('empresa suspensa', () => {
  beforeEach(() => prisma.empresas.update({ where: { id: f.B.empresa.id }, data: { ativo: false } }));

  it('login → 403 "Empresa suspensa"', async () => {
    const res = await request(app).post('/auth/login').send({ email: f.B.users.admin.email, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Empresa suspensa');
  });

  it('token já emitido → 403', async () => {
    const res = await request(app).get('/velorios').set(f.as(f.B.users.admin));
    expect(res.status).toBe(403);
  });

  it('páginas públicas → 404', async () => {
    expect((await request(app).get(`/public/velorios/${f.B.velorio.token_acesso}`)).status).toBe(404);
    expect((await request(app).get(`/public/velorios/id/${f.B.velorio.id}`)).status).toBe(404);
    expect((await request(app).get(`/public/empresas/${f.B.empresa.hash_publico}/salas/sala-1`)).status).toBe(404);
  });

  it('a empresa A continua funcionando', async () => {
    expect((await request(app).get('/velorios').set(f.as(f.A.users.admin))).status).toBe(200);
  });
});

describe('/auth/me', () => {
  it('traz a empresa do usuário (campos públicos) e null para platform_admin', async () => {
    const me = await request(app).get('/auth/me').set(f.as(f.A.users.viewer));
    expect(me.body.empresa).toMatchObject({ id: f.A.empresa.id, hash_publico: f.A.empresa.hash_publico });
    expect(me.body.empresa.ativo).toBeUndefined();
    const plat = await request(app).get('/auth/me').set(f.as(f.platformAdmin));
    expect(plat.body.empresa).toBeNull();
  });
});
