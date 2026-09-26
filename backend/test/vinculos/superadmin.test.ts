import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const MSG = 'Este usuário também atende outra empresa; fale com o suporte da Campax';

async function cenario() {
  const [a, b] = [await createEmpresa(), await createEmpresa()];
  const superadmin = await createProfile({ role: 'superadmin', empresa_id: a.id });
  const compartilhado = await createProfile({ role: 'operador', empresa_id: a.id });
  await vincular(compartilhado.id, b.id);
  const soDeA = await createProfile({ role: 'viewer', empresa_id: a.id });
  return { a, b, superadmin, compartilhado, soDeA, h: authHeader(superadmin) };
}

describe('superadmin e usuário compartilhado', () => {
  it('GET /users mostra outras_empresas (quantas, não quais)', async () => {
    const { b, compartilhado, soDeA, h } = await cenario();
    const res = await request(app).get('/users').set(h);
    const porId = new Map(res.body.data.map((u: any) => [u.id, u]));
    expect((porId.get(compartilhado.id) as any).outras_empresas).toBe(1);
    expect((porId.get(soDeA.id) as any).outras_empresas).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain(b.id);
  });

  it.each([
    ['senha', (id: string) => ['patch', `/users/${id}`, { password: 'nova-senha-123' }]],
    ['papel', (id: string) => ['patch', `/users/${id}/role`, { role: 'admin' }]],
    ['ativo', (id: string) => ['patch', `/users/${id}/active`, { is_active: false }]],
  ] as const)('%s de compartilhado → 403', async (_nome, rota) => {
    const { compartilhado, h } = await cenario();
    const [, url, body] = rota(compartilhado.id);
    const res = await request(app).patch(url).set(h).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(MSG);
  });

  it('nome e WhatsApp de compartilhado continuam editáveis', async () => {
    const { compartilhado, h } = await cenario();
    const res = await request(app).patch(`/users/${compartilhado.id}`).set(h).send({ full_name: 'Novo', numero_whatsapp: '62999990000' });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Novo');
  });

  it('com usuário só da empresa, tudo continua como antes', async () => {
    const { soDeA, h } = await cenario();
    expect((await request(app).patch(`/users/${soDeA.id}/role`).set(h).send({ role: 'admin' })).status).toBe(200);
    expect((await request(app).patch(`/users/${soDeA.id}/active`).set(h).send({ is_active: false })).status).toBe(200);
  });

  it('DELETE /users/:id/vinculo tira só da empresa dele', async () => {
    const { a, b, compartilhado, h } = await cenario();
    const res = await request(app).delete(`/users/${compartilhado.id}/vinculo`).set(h);
    expect(res.status).toBe(200);
    const restantes = await prisma.usuario_empresas.findMany({ where: { profile_id: compartilhado.id } });
    expect(restantes.map((v) => v.empresa_id)).toEqual([b.id]);
    expect((await request(app).get('/users').set(h)).body.data.map((u: any) => u.id)).not.toContain(compartilhado.id);
    expect(a.id).not.toBe(b.id);
  });

  it('POST /users grava quem criou o vínculo (created_by)', async () => {
    const { a, superadmin, h } = await cenario();
    const res = await request(app).post('/users').set(h).send({ email: 'novo-vinculo@x.com', password: 'senha-123456', role: 'viewer' });
    expect(res.status).toBe(200);
    const vinculo = await prisma.usuario_empresas.findUnique({
      where: { profile_id_empresa_id: { profile_id: res.body.data.id, empresa_id: a.id } },
    });
    expect(vinculo?.created_by).toBe(superadmin.id);
  });

  it('remover a si mesmo → 400; usuário de outra empresa → 404', async () => {
    const { superadmin, h } = await cenario();
    expect((await request(app).delete(`/users/${superadmin.id}/vinculo`).set(h)).status).toBe(400);
    const deOutra = await createProfile({ role: 'viewer' });
    expect((await request(app).delete(`/users/${deOutra.id}/vinculo`).set(h)).status).toBe(404);
  });
});

describe('regra do último superadmin (U8) no painel', () => {
  // In /users the caller is always an active superadmin of the empresa, so the target is never the
  // last one (self-demote/deactivate/remove are refused by their own checks). The U8 call there is
  // defensive; its refusals are exercised through /platform (Task 4). Here: the normal path still works.
  it('com dois superadmins, um rebaixa, desativa e remove o outro', async () => {
    const a = await createEmpresa();
    const s1 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    const h1 = authHeader(s1);
    const s2 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).patch(`/users/${s2.id}/role`).set(h1).send({ role: 'admin' })).status).toBe(200);
    const s3 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).patch(`/users/${s3.id}/active`).set(h1).send({ is_active: false })).status).toBe(200);
    const s4 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).delete(`/users/${s4.id}/vinculo`).set(h1)).status).toBe(200);
  });
});
