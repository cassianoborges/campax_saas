import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { UPLOADS_DIR } from '../../src/lib/uploads';
import { resetDb } from '../helpers';
import { duasEmpresas, Fixture } from './fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterEach(() => {
  // Uploads made by these tests land under uploads/<empresa_id>/ of throwaway empresas.
  for (const e of [f.A.empresa.id, f.B.empresa.id]) fs.rmSync(path.join(UPLOADS_DIR, e), { recursive: true, force: true });
});
afterAll(() => prisma.$disconnect());

describe('escrita: usuário de A não altera nem apaga dados de B', () => {
  it.each([
    ['cameras', () => `/cameras/${f.B.camera.id}`, { nome: 'hackeada' }],
    ['salas', () => `/salas/${f.B.sala.id}`, { nome_sala_velorio: 'hackeada' }],
    ['velorios', () => `/velorios/${f.B.velorio.id}`, { nome_falecido: 'hackeado' }],
    ['homenagens-templates', () => `/homenagens-templates/${f.B.template.id}`, { titulo: 'hackeado' }],
    ['users', () => `/users/${f.B.users.viewer.id}`, { full_name: 'hackeado' }],
  ] as const)('PATCH em %s de B → 404', async (_nome, url, body) => {
    const res = await request(app).patch(url()).set(f.as(f.A.users.superadmin)).send(body);
    expect(res.status).toBe(404);
  });

  it('PATCH não mudou nada em B (conferido direto no banco)', async () => {
    const h = f.as(f.A.users.superadmin);
    await request(app).patch(`/velorios/${f.B.velorio.id}`).set(h).send({ nome_falecido: 'hackeado' });
    await request(app).patch(`/users/${f.B.users.viewer.id}/role`).set(h).send({ role: 'admin' });
    await request(app).patch(`/users/${f.B.users.viewer.id}/active`).set(h).send({ is_active: false });
    expect((await prisma.velorios.findUnique({ where: { id: f.B.velorio.id } }))!.nome_falecido).toBe('Falecido B');
    const viewerB = await prisma.profiles.findUnique({ where: { id: f.B.users.viewer.id } });
    expect(viewerB).toMatchObject({ role: 'viewer', is_active: true });
  });

  it.each([
    ['cameras', () => `/cameras/${f.B.camera.id}`],
    ['salas', () => `/salas/${f.B.sala.id}`],
    ['velorios', () => `/velorios/${f.B.velorio.id}`],
    ['homenagens-templates', () => `/homenagens-templates/${f.B.template.id}`],
  ] as const)('DELETE em %s de B → 404 e o registro continua lá', async (_nome, url) => {
    const res = await request(app).delete(url()).set(f.as(f.A.users.superadmin));
    expect(res.status).toBe(404);
    expect(await prisma.velorios.count({ where: { id: f.B.velorio.id } })).toBe(1);
    expect(await prisma.cameras.count({ where: { id: f.B.camera.id } })).toBe(1);
  });

  it('DELETE de homenagem de B pela URL de um velório de A → 404 (C4)', async () => {
    const res = await request(app)
      .delete(`/velorios/${f.A.velorio.id}/homenagens/${f.B.homenagem.id}`)
      .set(f.as(f.A.users.admin));
    expect(res.status).toBe(404);
    expect(await prisma.velorio_homenagens.count({ where: { id: f.B.homenagem.id } })).toBe(1);
  });

  it('DELETE de homenagem de A pelo próprio velório funciona', async () => {
    const res = await request(app)
      .delete(`/velorios/${f.A.velorio.id}/homenagens/${f.A.homenagem.id}`)
      .set(f.as(f.A.users.admin));
    expect(res.status).toBe(200);
  });

  it('check-status com id de B não testa nem muda a câmera de B (C3)', async () => {
    const res = await request(app).post('/cameras/check-status').set(f.as(f.A.users.operador)).send({ ids: [f.B.camera.id, f.A.camera.id] });
    expect(Object.keys(res.body.data)).toEqual([f.A.camera.id]);
    expect((await prisma.cameras.findUnique({ where: { id: f.B.camera.id } }))!.status).toBe('unknown');
  });
});

describe('mass assignment (C1)', () => {
  it('empresa_id no corpo é ignorado no POST e no PATCH', async () => {
    const h = f.as(f.A.users.admin);
    const criada = await request(app).post('/cameras').set(h).send({ nome: 'Nova', rtsp_url: 'rtsp://203.0.113.10/y', empresa_id: f.B.empresa.id });
    expect(criada.status).toBe(200);
    expect(criada.body.data.empresa_id).toBe(f.A.empresa.id);

    await request(app).patch(`/cameras/${f.A.camera.id}`).set(h).send({ empresa_id: f.B.empresa.id });
    expect((await prisma.cameras.findUnique({ where: { id: f.A.camera.id } }))!.empresa_id).toBe(f.A.empresa.id);

    const template = await request(app).post('/homenagens-templates').set(h).send({ titulo: 'T', mensagem: 'M', empresa_id: null });
    expect(template.body.data.empresa_id).toBe(f.A.empresa.id);
  });

  it('PATCH de velório não troca token_acesso, created_by nem mediamtx_path da câmera', async () => {
    const h = f.as(f.A.users.operador);
    await request(app).patch(`/velorios/${f.A.velorio.id}`).set(h).send({ token_acesso: 'ZZZZZZ', created_by: f.B.users.viewer.id });
    const velorio = await prisma.velorios.findUnique({ where: { id: f.A.velorio.id } });
    expect(velorio!.token_acesso).toBe(f.A.velorio.token_acesso);
    expect(velorio!.created_by).toBe(f.A.users.operador.id);

    await request(app).patch(`/cameras/${f.A.camera.id}`).set(h).send({ mediamtx_path: 'sequestrado', webrtc_url: 'https://evil' });
    const camera = await prisma.cameras.findUnique({ where: { id: f.A.camera.id } });
    expect(camera).toMatchObject({ mediamtx_path: null, webrtc_url: null });
  });

  it('datas sem hora do formulário (data_nascimento/falecimento) são aceitas', async () => {
    const res = await request(app)
      .patch(`/velorios/${f.A.velorio.id}`)
      .set(f.as(f.A.users.operador))
      .send({ data_nascimento: '1950-01-31', data_falecimento: '2026-09-20' });
    expect(res.status).toBe(200);
    expect(res.body.data.data_nascimento).toBe('1950-01-31T00:00:00.000Z');
  });

  it('POST /velorios grava created_by do usuário logado e empresa de A', async () => {
    const res = await request(app).post('/velorios').set(f.as(f.A.users.operador)).send({
      nome_falecido: 'Novo', data_inicio: new Date().toISOString(), data_fim: new Date(Date.now() + 3600_000).toISOString(),
      sala_velorio_id: f.A.sala.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ empresa_id: f.A.empresa.id, created_by: f.A.users.operador.id });
  });
});

describe('vínculos entre empresas', () => {
  it('sala de A com câmera de B → 404 (C6), e nada é vinculado', async () => {
    const h = f.as(f.A.users.operador);
    const nova = await request(app).post('/salas').set(h).send({ nome_sala_velorio: 'Nova', slug: 'nova', camera_ids: [f.B.camera.id] });
    expect(nova.status).toBe(404);
    expect(await prisma.sala_velorio.count({ where: { slug: 'nova' } })).toBe(0);

    const edit = await request(app).patch(`/salas/${f.A.sala.id}`).set(h).send({ camera_ids: [f.B.camera.id] });
    expect(edit.status).toBe(404);
    const vinculos = await prisma.sala_velorio_cameras.findMany({ where: { sala_velorio_id: f.A.sala.id } });
    expect(vinculos.map((v) => v.camera_id)).toEqual([f.A.camera.id]);
  });

  it('velório de A com sala de B → rejeitado', async () => {
    const h = f.as(f.A.users.operador);
    const res = await request(app).post('/velorios').set(h).send({
      nome_falecido: 'X', data_inicio: new Date().toISOString(), data_fim: new Date(Date.now() + 3600_000).toISOString(),
      sala_velorio_id: f.B.sala.id,
    });
    expect(res.status).toBe(404);
    const patch = await request(app).patch(`/velorios/${f.A.velorio.id}`).set(h).send({ sala_velorio_id: f.B.sala.id });
    expect(patch.status).toBe(404);
    expect((await prisma.velorios.findUnique({ where: { id: f.A.velorio.id } }))!.sala_velorio_id).toBe(f.A.sala.id);
  });
});

describe('upload de foto (C5)', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  it('velório de B → 404 e nenhum arquivo criado no disco', async () => {
    const res = await request(app)
      .post(`/velorios/${f.B.velorio.id}/foto`)
      .set(f.as(f.A.users.operador))
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(fs.existsSync(path.join(UPLOADS_DIR, f.A.empresa.id))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_DIR, f.B.empresa.id))).toBe(false);
  });

  it('velório de A → salvo em uploads/<empresa>/falecido-fotos/<velorio>/', async () => {
    const res = await request(app)
      .post(`/velorios/${f.A.velorio.id}/foto`)
      .set(f.as(f.A.users.operador))
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain(`/files/${f.A.empresa.id}/falecido-fotos/${f.A.velorio.id}/foto.png`);
    expect(fs.existsSync(path.join(UPLOADS_DIR, f.A.empresa.id, 'falecido-fotos', f.A.velorio.id, 'foto.png'))).toBe(true);
  });

  it('atrás do proxy HTTPS a URL gravada é https', async () => {
    const res = await request(app)
      .post(`/velorios/${f.A.velorio.id}/foto`)
      .set(f.as(f.A.users.operador))
      .set('X-Forwarded-Proto', 'https')
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.body.url).toMatch(/^https:\/\//);
  });
});

describe('transação de req.db', () => {
  it('continua filtrada pela empresa (as rotas de /users gravam por ela)', async () => {
    const { prismaForEmpresa } = await import('../../src/tenant/prismaForEmpresa');
    const db = prismaForEmpresa(f.A.empresa.id, f.A.users.superadmin.id);
    const vistos = await db.$transaction((tx) => tx.cameras.findMany({ select: { id: true } }));
    expect(vistos.map((c) => c.id)).not.toContain(f.B.camera.id);
    await expect(
      db.$transaction((tx) => tx.profiles.update({ where: { id: f.B.users.viewer.id }, data: { full_name: 'hackeado' } })),
    ).rejects.toThrow();
  });
});
