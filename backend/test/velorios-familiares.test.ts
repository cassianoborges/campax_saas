import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDb } from './helpers';
import { duasEmpresas, Fixture } from './isolamento/fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

const patch = (id: string, body: object, user = f.A.users.operador) =>
  request(app).patch(`/velorios/${id}`).set(f.as(user)).send(body);

describe('velorios.familiares', () => {
  it('PATCH grava e devolve familiares (sem espaços nas pontas)', async () => {
    const res = await patch(f.A.velorio.id, { familiares: '  Deixa a esposa Maria e os filhos João e Ana.  ' });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
    const lista = await request(app).get('/velorios').set(f.as(f.A.users.viewer));
    expect(lista.body.data.find((v: any) => v.id === f.A.velorio.id).familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
  });

  it('vazio ou só espaços apaga (null)', async () => {
    await patch(f.A.velorio.id, { familiares: 'Texto' });
    const res = await patch(f.A.velorio.id, { familiares: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBeNull();
    expect((await patch(f.A.velorio.id, { familiares: null })).body.data.familiares).toBeNull();
  });

  it('400 caracteres passa; 401 → 400', async () => {
    expect((await patch(f.A.velorio.id, { familiares: 'a'.repeat(400) })).status).toBe(200);
    const res = await patch(f.A.velorio.id, { familiares: 'a'.repeat(401) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Familiares: máximo de 400 caracteres');
  });

  it('tipo errado → 400', async () => {
    const res = await patch(f.A.velorio.id, { familiares: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Familiares: máximo de 400 caracteres');
  });

  it('POST aceita familiares', async () => {
    const res = await request(app).post('/velorios').set(f.as(f.A.users.operador)).send({
      nome_falecido: 'Fulano', data_inicio: new Date().toISOString(),
      data_fim: new Date(Date.now() + 3600_000).toISOString(), sala_velorio_id: f.A.sala.id, familiares: 'Deixa filhos.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBe('Deixa filhos.');
  });

  it('respostas públicas não trazem familiares', async () => {
    await patch(f.A.velorio.id, { familiares: 'Deixa a esposa Maria.' });
    const porToken = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    expect(porToken.status).toBe(200);
    expect(porToken.body.data).not.toHaveProperty('familiares');
    const porId = await request(app).get(`/public/velorios/id/${f.A.velorio.id}`);
    expect(porId.status).toBe(200);
    expect(porId.body.data).not.toHaveProperty('familiares');
  });

  it('usuário de A não altera familiares de velório de B → 404', async () => {
    const res = await patch(f.B.velorio.id, { familiares: 'hackeado' });
    expect(res.status).toBe(404);
    expect((await prisma.velorios.findUnique({ where: { id: f.B.velorio.id } }))!.familiares).toBeNull();
  });
});
