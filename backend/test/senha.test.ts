import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, TEST_PASSWORD } from './helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const NOVA = 'nova-senha-456';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password: string) {
  return request(app).post('/auth/login').send({ email, password });
}

describe('POST /auth/senha', () => {
  it('sem login → 401', async () => {
    const res = await request(app).post('/auth/senha').send({ senha_atual: TEST_PASSWORD, nova_senha: NOVA });
    expect(res.status).toBe(401);
  });

  it.each([
    ['senha atual errada', { senha_atual: 'errada-123', nova_senha: NOVA }],
    ['nova senha curta', { senha_atual: TEST_PASSWORD, nova_senha: 'curta' }],
    ['nova igual à atual', { senha_atual: TEST_PASSWORD, nova_senha: TEST_PASSWORD }],
  ])('%s → 400 (não 401, para não deslogar)', async (_nome, body) => {
    const user = await createProfile({ role: 'operador' });
    const res = await request(app).post('/auth/senha').set(authHeader(user)).send(body);
    expect(res.status).toBe(400);
    const me = await request(app).get('/auth/me').set(authHeader(user));
    expect(me.status).toBe(200);
  });

  it.each(['operador', 'platform_admin'] as const)('%s troca: login novo vale, antigo cai, nova senha entra', async (role) => {
    const user = await createProfile({ role });
    const antigo = authHeader(user);

    const res = await request(app).post('/auth/senha').set(antigo).send({ senha_atual: TEST_PASSWORD, nova_senha: NOVA });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    expect((await request(app).get('/auth/me').set(bearer(res.body.token))).status).toBe(200);
    const caiu = await request(app).get('/auth/me').set(antigo);
    expect(caiu.status).toBe(401);
    expect(caiu.body.error).toMatch(/senha foi alterada/);

    expect((await login(user.email, TEST_PASSWORD)).status).toBe(401);
    const novoLogin = await login(user.email, NOVA);
    expect(novoLogin.status).toBe(200);
    expect((await request(app).get('/auth/me').set(bearer(novoLogin.body.token))).status).toBe(200);
  });
});

describe('redefinições derrubam os logins antigos', () => {
  it('pela plataforma', async () => {
    const plat = await createProfile({ role: 'platform_admin' });
    const user = await createProfile({ role: 'viewer' });
    const antigo = authHeader(user);
    const res = await request(app).patch(`/platform/empresas/${user.empresa_id}/usuarios/${user.id}/senha`)
      .set(authHeader(plat)).send({ password: NOVA });
    expect(res.status).toBe(200);
    expect((await request(app).get('/auth/me').set(antigo)).status).toBe(401);
  });

  it('pelo superadmin; senha curta → 400', async () => {
    const empresa = await createEmpresa();
    const superadmin = await createProfile({ role: 'superadmin', empresa_id: empresa.id });
    const user = await createProfile({ role: 'viewer', empresa_id: empresa.id });
    const antigo = authHeader(user);

    const curta = await request(app).patch(`/users/${user.id}`).set(authHeader(superadmin)).send({ password: 'curta' });
    expect(curta.status).toBe(400);
    expect((await request(app).get('/auth/me').set(antigo)).status).toBe(200);

    const res = await request(app).patch(`/users/${user.id}`).set(authHeader(superadmin)).send({ password: NOVA });
    expect(res.status).toBe(200);
    expect((await request(app).get('/auth/me').set(antigo)).status).toBe(401);
  });

  it('editar outros dados do usuário não derruba o login', async () => {
    const empresa = await createEmpresa();
    const superadmin = await createProfile({ role: 'superadmin', empresa_id: empresa.id });
    const user = await createProfile({ role: 'viewer', empresa_id: empresa.id });
    const res = await request(app).patch(`/users/${user.id}`).set(authHeader(superadmin)).send({ full_name: 'Outro nome' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/auth/me').set(authHeader(user))).status).toBe(200);
  });
});
