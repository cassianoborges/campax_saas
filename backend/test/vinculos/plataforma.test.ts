import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, TEST_PASSWORD, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

async function cenario() {
  const plat = await createProfile({ role: 'platform_admin' });
  const [a, b] = [await createEmpresa({ nome: 'Funerária Alfa' }), await createEmpresa({ nome: 'Funerária Beta' })];
  return { a, b, plat, h: authHeader(plat) };
}

describe('/platform/usuarios', () => {
  it('só platform_admin', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    expect((await request(app).get('/platform/usuarios').set(authHeader(superadmin))).status).toBe(403);
  });

  it('cria sem empresa, vincula a duas, e o usuário escolhe ao entrar', async () => {
    const { a, b, h } = await cenario();
    const criado = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'Tecnico@Example.com', password: 'senha-forte-1', role: 'admin', full_name: 'Técnico' });
    expect(criado.status).toBe(200);
    expect(criado.body.data).toMatchObject({ email: 'tecnico@example.com', empresas: [] });
    expect(criado.body.data.password_hash).toBeUndefined();
    const id = criado.body.data.id;

    expect((await request(app).post('/auth/login').send({ email: 'tecnico@example.com', password: 'senha-forte-1' })).status).toBe(403);

    await request(app).put(`/platform/usuarios/${id}/empresas/${a.id}`).set(h);
    const duas = await request(app).put(`/platform/usuarios/${id}/empresas/${b.id}`).set(h);
    expect(duas.body.data.empresas.map((e: any) => e.id).sort()).toEqual([a.id, b.id].sort());

    const login = await request(app).post('/auth/login').send({ email: 'tecnico@example.com', password: 'senha-forte-1' });
    expect(login.body.escolher_empresa).toBe(true);
  });

  it('cria já com empresas; empresa inexistente → 400 e nada criado', async () => {
    const { a, h } = await cenario();
    const ok = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'x@example.com', password: 'senha-forte-1', role: 'viewer', empresa_ids: [a.id] });
    expect(ok.body.data.empresas.map((e: any) => e.id)).toEqual([a.id]);
    const ruim = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'y@example.com', password: 'senha-forte-1', role: 'viewer', empresa_ids: ['00000000-0000-0000-0000-000000000000'] });
    expect(ruim.status).toBe(400);
    expect(await prisma.profiles.count({ where: { email: 'y@example.com' } })).toBe(0);
  });

  it('valida e-mail, senha, papel; e-mail repetido → 409; nunca cria platform_admin', async () => {
    const { h } = await cenario();
    const base = { email: 'z@example.com', password: 'senha-forte-1', role: 'viewer' };
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, email: 'sem-arroba' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, password: 'curta' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, role: 'platform_admin' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send(base)).status).toBe(200);
    expect((await request(app).post('/platform/usuarios').set(h).send(base)).status).toBe(409);
  });

  it('lista com busca e filtros (empresa, sem empresa); nunca lista platform_admin', async () => {
    const { a, plat, h } = await cenario();
    const maria = await createProfile({ role: 'admin', empresa_id: a.id, email: 'maria@example.com' });
    const solto = await createProfile({ role: 'viewer', empresa_id: null, email: 'solto@example.com' });
    const todos = (await request(app).get('/platform/usuarios').set(h)).body.data.map((u: any) => u.id);
    expect(todos).toEqual(expect.arrayContaining([maria.id, solto.id]));
    expect(todos).not.toContain(plat.id);
    expect((await request(app).get('/platform/usuarios?busca=MARIA').set(h)).body.data.map((u: any) => u.id)).toEqual([maria.id]);
    expect((await request(app).get(`/platform/usuarios?empresa_id=${a.id}`).set(h)).body.data.map((u: any) => u.id)).toEqual([maria.id]);
    expect((await request(app).get('/platform/usuarios?empresa_id=nenhuma').set(h)).body.data.map((u: any) => u.id)).toEqual([solto.id]);
  });

  it('vincular é idempotente; desvincular o que não existe → 404; platform_admin → 404', async () => {
    const { a, b, plat, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    expect((await request(app).put(`/platform/usuarios/${user.id}/empresas/${a.id}`).set(h)).status).toBe(200);
    expect(await prisma.usuario_empresas.count({ where: { profile_id: user.id } })).toBe(1);
    expect((await request(app).delete(`/platform/usuarios/${user.id}/empresas/${b.id}`).set(h)).status).toBe(404);
    expect((await request(app).put(`/platform/usuarios/${plat.id}/empresas/${a.id}`).set(h)).status).toBe(404);
  });

  it('senha derruba sessões; papel e ativo', async () => {
    const { a, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    const antigo = authHeader(user);
    expect((await request(app).patch(`/platform/usuarios/${user.id}/senha`).set(h).send({ password: 'nova-senha-123' })).status).toBe(200);
    expect((await request(app).get('/auth/me').set(antigo)).status).toBe(401);
    const papel = await request(app).patch(`/platform/usuarios/${user.id}`).set(h).send({ role: 'operador', full_name: 'Ana' });
    expect(papel.body.data).toMatchObject({ role: 'operador', full_name: 'Ana' });
    expect((await request(app).patch(`/platform/usuarios/${user.id}`).set(h).send({ role: 'platform_admin' })).status).toBe(400);
    expect((await request(app).patch(`/platform/usuarios/${user.id}/ativo`).set(h).send({ is_active: false })).body.data.is_active).toBe(false);
    expect((await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(401);
  });

  it('U8 olha todas as empresas da pessoa', async () => {
    const { a, b, h } = await cenario();
    const dono = await createProfile({ role: 'superadmin', empresa_id: a.id });
    await vincular(dono.id, b.id);
    await createProfile({ role: 'superadmin', empresa_id: a.id }); // A has another one; B doesn't
    const desativar = await request(app).patch(`/platform/usuarios/${dono.id}/ativo`).set(h).send({ is_active: false });
    expect(desativar.status).toBe(400);
    expect(desativar.body.error).toContain('Funerária Beta');
    expect((await request(app).patch(`/platform/usuarios/${dono.id}`).set(h).send({ role: 'admin' })).status).toBe(400);
    expect((await request(app).delete(`/platform/usuarios/${dono.id}/empresas/${b.id}`).set(h)).status).toBe(400);
    expect((await request(app).delete(`/platform/usuarios/${dono.id}/empresas/${a.id}`).set(h)).status).toBe(200);
  });

  it('aba da empresa mostra outras_empresas', async () => {
    const { a, b, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    await vincular(user.id, b.id);
    const res = await request(app).get(`/platform/empresas/${a.id}/usuarios`).set(h);
    expect(res.body.data.find((u: any) => u.id === user.id).outras_empresas).toBe(1);
  });
});
