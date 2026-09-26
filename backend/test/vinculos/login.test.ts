import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, TEST_PASSWORD, vincular } from '../helpers';
import { duasEmpresas, idsIn, idsOf } from '../isolamento/fixture';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const login = (email: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/auth/login').send({ email, password: TEST_PASSWORD, ...extra });

async function usuarioEmDuas() {
  const [a, b, c] = [await createEmpresa(), await createEmpresa(), await createEmpresa()];
  const user = await createProfile({ role: 'admin', empresa_id: a.id });
  await vincular(user.id, b.id);
  return { a, b, c, user };
}

describe('login', () => {
  it('um vínculo: entra direto, com a empresa e a lista', async () => {
    const user = await createProfile({ role: 'admin' });
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(user.empresa_id);
    expect(res.body.empresas).toHaveLength(1);
    expect(res.body.escolher_empresa).toBeUndefined();
    expect((await request(app).get('/cameras').set(bearer(res.body.token))).status).toBe(200);
  });

  it('sem vínculo → 403', async () => {
    const user = await createProfile({ role: 'admin', empresa_id: null });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Nenhuma empresa vinculada a este usuário');
  });

  it('vários vínculos: login provisório com a lista para escolher', async () => {
    const { a, b, user } = await usuarioEmDuas();
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.escolher_empresa).toBe(true);
    expect(res.body.empresa).toBeNull();
    expect(res.body.empresas.map((e: { id: string }) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect((await request(app).get('/cameras').set(bearer(res.body.token))).status).toBe(403);
  });

  it('vários vínculos, uma suspensa: aparece como inativa na lista', async () => {
    const { b, user } = await usuarioEmDuas();
    await prisma.empresas.update({ where: { id: b.id }, data: { ativo: false } });
    const res = await login(user.email);
    expect(res.body.empresas.find((e: { id: string }) => e.id === b.id).ativo).toBe(false);
  });

  it('vários vínculos, todas suspensas → 403 Empresa suspensa', async () => {
    const { a, b, user } = await usuarioEmDuas();
    await prisma.empresas.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { ativo: false } });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Empresa suspensa');
  });

  it('subdomínio de uma das empresas: entra direto nela', async () => {
    const { b, user } = await usuarioEmDuas();
    const res = await login(user.email, { empresa_slug: b.slug });
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(b.id);
  });

  it('subdomínio de outra empresa → 401 igual a senha errada', async () => {
    const { c, user } = await usuarioEmDuas();
    const res = await login(user.email, { empresa_slug: c.slug });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas');
  });
});

describe('POST /auth/empresa', () => {
  it('escolhe a empresa a partir do login provisório', async () => {
    const { b, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const res = await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: b.id });
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(b.id);
    const me = await request(app).get('/auth/me').set(bearer(res.body.token));
    expect(me.body.empresa.id).toBe(b.id);
    expect(me.body.empresas).toHaveLength(2);
  });

  it('empresa sem vínculo → 404; suspensa → 403', async () => {
    const { b, c, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    expect((await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: c.id })).status).toBe(404);
    await prisma.empresas.update({ where: { id: b.id }, data: { ativo: false } });
    expect((await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: b.id })).status).toBe(403);
  });

  it('platform_admin → 403', async () => {
    const plat = await createProfile({ role: 'platform_admin' });
    const empresa = await createEmpresa();
    const res = await request(app).post('/auth/empresa').set(authHeader(plat)).send({ empresa_id: empresa.id });
    expect(res.status).toBe(403);
  });

  it('trocar a senha funciona com o login provisório', async () => {
    const { user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const res = await request(app).post('/auth/senha').set(bearer(provisorio))
      .send({ senha_atual: TEST_PASSWORD, nova_senha: 'outra-senha-99' });
    expect(res.status).toBe(200);
  });

  it('desvinculado da empresa ativa: 401 na próxima requisição', async () => {
    const { a, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const token = (await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: a.id })).body.token;
    expect((await request(app).get('/cameras').set(bearer(token))).status).toBe(200);
    await prisma.usuario_empresas.delete({ where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: a.id } } });
    expect((await request(app).get('/cameras').set(bearer(token))).status).toBe(401);
  });
});

describe('isolamento com usuário em duas empresas', () => {
  const LISTAGENS = ['/cameras', '/salas', '/velorios', '/velorios/audit', '/access-logs', '/visitantes', '/terms-acceptances', '/users', '/homenagens-templates'];

  it.each(LISTAGENS)('GET %s agindo por A não mostra nada de B, e vice-versa', async (rota) => {
    const f = await duasEmpresas();
    const compartilhado = await createProfile({ role: 'superadmin', empresa_id: f.A.empresa.id });
    await vincular(compartilhado.id, f.B.empresa.id);
    const provisorio = (await login(compartilhado.email)).body.token;
    for (const [agindo, outra] of [[f.A, f.B], [f.B, f.A]] as const) {
      const token = (await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: agindo.empresa.id })).body.token;
      const res = await request(app).get(rota).set(bearer(token));
      expect(res.status).toBe(200);
      const vistos = idsIn(res.body.data);
      for (const id of idsOf(outra)) expect(vistos, `id vazou em ${rota}`).not.toContain(id);
    }
  });
});
