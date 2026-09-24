import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { resetDb } from '../helpers';
import { duasEmpresas, Fixture, idsIn, idsOf } from './fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

const LISTAGENS = [
  '/cameras',
  '/salas',
  '/velorios',
  '/velorios/audit',
  '/access-logs',
  '/visitantes',
  '/terms-acceptances',
  '/users',
  '/homenagens-templates',
];

describe('leitura: usuário de A nunca vê dados de B', () => {
  it.each(LISTAGENS)('GET %s não contém nenhum id de B', async (rota) => {
    const res = await request(app).get(rota).set(f.as(f.A.users.superadmin));
    expect(res.status).toBe(200);
    const vistos = idsIn(res.body.data);
    for (const idB of idsOf(f.B)) expect(vistos, `id de B vazou em ${rota}`).not.toContain(idB);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('contagens de estatística refletem só a empresa A', async () => {
    const stats = await request(app).get('/velorios/creation-stats').set(f.as(f.A.users.viewer));
    expect(stats.body.data.total_velorios).toBe(1);
    const acessos = await request(app).get('/access-stats/overall').set(f.as(f.A.users.viewer));
    expect(acessos.body.data).toMatchObject({ total_accesses: 1, total_velorios: 1 });
  });

  it('GET /velorios/:id e /access-stats de um velório de B → 404', async () => {
    const h = f.as(f.A.users.superadmin);
    expect((await request(app).get(`/velorios/${f.B.velorio.id}`).set(h)).status).toBe(404);
    expect((await request(app).get(`/velorios/${f.B.velorio.id}/access-stats`).set(h)).status).toBe(404);
    expect((await request(app).get(`/velorios/${f.A.velorio.id}`).set(h)).status).toBe(200);
  });

  it('id malformado responde 404, não 500', async () => {
    const res = await request(app).get('/velorios/nao-e-uuid').set(f.as(f.A.users.viewer));
    expect(res.status).toBe(404);
  });

  it('filtro por velorioId de B nos relatórios devolve lista vazia', async () => {
    const h = f.as(f.A.users.viewer);
    const logs = await request(app).get(`/access-logs?velorioId=${f.B.velorio.id}`).set(h);
    expect(logs.body.data).toEqual([]);
    const visitantes = await request(app).get(`/visitantes?velorioId=${f.B.velorio.id}`).set(h);
    expect(visitantes.body.data).toEqual([]);
  });

  it('modelos de homenagem: A vê os próprios e os globais, não os de B', async () => {
    const res = await request(app).get('/homenagens-templates').set(f.as(f.A.users.viewer));
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining([f.A.template.id, f.templateGlobal.id]));
    expect(ids).not.toContain(f.B.template.id);
  });
});
