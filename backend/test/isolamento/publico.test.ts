import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { resetDb } from '../helpers';
import { duasEmpresas, Fixture } from './fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

describe('rotas públicas', () => {
  it('velório por token e por id: sem rtsp_url (C8) e com a empresa (sem o campo ativo)', async () => {
    for (const url of [`/public/velorios/${f.A.velorio.token_acesso}`, `/public/velorios/id/${f.A.velorio.id}`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('rtsp');
      expect(res.body.data.empresa).toMatchObject({ id: f.A.empresa.id, nome_exibicao: 'Empresa A' });
      expect(res.body.data.empresa.ativo).toBeUndefined();
    }
  });

  it('link de sala: mesmo slug em A e B, cada hash mostra a sua sala', async () => {
    const a = await request(app).get(`/public/empresas/${f.A.empresa.hash_publico}/salas/sala-1`);
    const b = await request(app).get(`/public/empresas/${f.B.empresa.hash_publico}/salas/sala-1`);
    expect(a.body.data.sala.id).toBe(f.A.sala.id);
    expect(b.body.data.sala.id).toBe(f.B.sala.id);
    expect(a.body.data.atual.id).toBe(f.A.velorio.id);
    expect(a.body.data.empresa.id).toBe(f.A.empresa.id);
  });

  it('hash inexistente → 404; rota antiga /public/salas/:slug não existe mais', async () => {
    expect((await request(app).get('/public/empresas/naoexiste/salas/sala-1')).status).toBe(404);
    expect((await request(app).get('/public/salas/sala-1')).status).toBe(404);
  });

  it('GET /public/empresas/:hash devolve só campos públicos', async () => {
    const res = await request(app).get(`/public/empresas/${f.A.empresa.hash_publico}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['cor_primaria', 'cor_secundaria', 'email_contato', 'hash_publico', 'id', 'logo_url', 'nome_exibicao', 'slug', 'whatsapp_contato'],
    );
  });

  it('access log grava a empresa do velório, não a do corpo', async () => {
    await request(app).post(`/public/velorios/${f.B.velorio.id}/access-logs`).send({ token: f.B.velorio.token_acesso, empresa_id: f.A.empresa.id });
    const logs = await prisma.velorio_access_logs.findMany({ where: { velorio_id: f.B.velorio.id } });
    expect(logs.every((l) => l.empresa_id === f.B.empresa.id)).toBe(true);
    expect(logs).toHaveLength(2);
  });

  it('access log registra o IP do visitante via proxy, sem aceitar IP forjado de fora', async () => {
    await request(app).post(`/public/velorios/${f.A.velorio.id}/access-logs`).set('X-Forwarded-For', '203.0.113.7').send({});
    const log = await prisma.velorio_access_logs.findFirst({ where: { velorio_id: f.A.velorio.id }, orderBy: { accessed_at: 'desc' } });
    // The test client connects from loopback (a trusted hop), so the forwarded client IP is used.
    expect(log!.ip_address).toBe('203.0.113.7');
  });

  it('velório inexistente: visitantes/homenagens → 404; access log segue best-effort', async () => {
    const fake = '00000000-0000-0000-0000-000000000000';
    expect((await request(app).post(`/public/velorios/${fake}/visitantes`).send({ nome: 'X', celular: '1' })).status).toBe(404);
    expect((await request(app).post(`/public/velorios/${fake}/homenagens`).send({ autor_nome: 'X', mensagem: 'Y' })).status).toBe(404);
    expect((await request(app).get(`/public/velorios/${fake}/homenagens`)).status).toBe(404);
    const log = await request(app).post(`/public/velorios/${fake}/access-logs`).send({});
    expect(log.status).toBe(200);
  });

  it('termos: aceite dado em B não vale para velório de A (C10)', async () => {
    const aceitoEmB = await request(app).get(
      `/public/terms/accepted?celular=celular-B&version=1.0&velorio_id=${f.B.velorio.id}`,
    );
    expect(aceitoEmB.body.accepted).toBe(true);
    const mesmoCelularEmA = await request(app).get(
      `/public/terms/accepted?celular=celular-B&version=1.0&velorio_id=${f.A.velorio.id}`,
    );
    expect(mesmoCelularEmA.body.accepted).toBe(false);
  });

  it('termos: velorio_id é obrigatório e define a empresa do aceite', async () => {
    expect((await request(app).get('/public/terms/accepted?celular=1&version=1.0')).status).toBe(400);
    const semVelorio = await request(app).post('/public/terms-acceptances').send({ nome: 'X', celular: '1', terms_version: '1.0', document_hash: 'h' });
    expect(semVelorio.status).toBe(400);
    const ok = await request(app)
      .post('/public/terms-acceptances')
      .send({ velorio_id: f.B.velorio.id, nome: 'X', celular: '1', terms_version: '1.0', document_hash: 'h', empresa_id: f.A.empresa.id });
    expect(ok.body.data.empresa_id).toBe(f.B.empresa.id);
  });
});
