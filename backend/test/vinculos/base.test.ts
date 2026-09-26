import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { resolverEmpresaAtiva } from '../../src/auth/empresaAtiva';
import { authHeader, authHeaderEmpresa, createEmpresa, createProfile, resetDb, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

describe('resolverEmpresaAtiva', () => {
  const A = { id: 'a' } as any;
  const B = { id: 'b' } as any;
  it.each([
    ['um vínculo, sem emp', [A], undefined, { tipo: 'empresa', empresa: A }],
    ['vários, sem emp', [A, B], undefined, { tipo: 'provisorio' }],
    ['nenhum, sem emp', [], undefined, { tipo: 'sem-vinculo' }],
    ['emp com vínculo', [A, B], 'b', { tipo: 'empresa', empresa: B }],
    ['emp sem vínculo', [A], 'b', { tipo: 'sem-acesso' }],
    ['emp e nenhum vínculo', [], 'a', { tipo: 'sem-acesso' }],
  ])('%s', (_nome, empresas, emp, esperado) => {
    expect(resolverEmpresaAtiva(empresas.map((empresa) => ({ empresa })), emp)).toEqual(esperado);
  });
});

describe('requireAuth com vínculos', () => {
  it('token antigo (sem emp) de quem tem um vínculo continua valendo', async () => {
    const user = await createProfile({ role: 'admin' });
    const res = await request(app).get('/cameras').set(authHeader(user));
    expect(res.status).toBe(200);
  });

  it('sem nenhum vínculo → 401 "Nenhuma empresa vinculada"', async () => {
    const user = await createProfile({ role: 'admin', empresa_id: null });
    const res = await request(app).get('/auth/me').set(authHeader(user));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Nenhuma empresa vinculada a este usuário');
  });

  it('vários vínculos sem emp: /auth/me responde, rotas de empresa → 403', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    const user = await createProfile({ role: 'admin', empresa_id: a.id });
    await vincular(user.id, b.id);
    expect((await request(app).get('/auth/me').set(authHeader(user))).status).toBe(200);
    expect((await request(app).get('/cameras').set(authHeader(user))).status).toBe(403);
  });

  it('emp de empresa sem vínculo → 401 "Você não tem mais acesso a esta empresa"', async () => {
    const outra = await createEmpresa();
    const user = await createProfile({ role: 'admin' });
    const res = await request(app).get('/cameras').set(authHeaderEmpresa(user, outra.id));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Você não tem mais acesso a esta empresa');
  });
});

describe('req.db e vínculos', () => {
  it('superadmin cria usuário já vinculado à empresa dele', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    const res = await request(app).post('/users').set(authHeader(superadmin))
      .send({ email: 'novo@example.com', password: 'senha-forte-1', role: 'viewer' });
    expect(res.status).toBe(200);
    const vinculos = await prisma.usuario_empresas.findMany({ where: { profile_id: res.body.data.id } });
    expect(vinculos.map((v) => v.empresa_id)).toEqual([superadmin.empresa_id]);
  });

  it('auditoria mostra o criador mesmo depois de desvinculado', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    const empresaId = superadmin.empresa_id!;
    const criador = await createProfile({ role: 'operador', empresa_id: empresaId });
    const sala = await prisma.sala_velorio.create({ data: { nome_sala_velorio: 'Sala', slug: 'sala-1', empresa_id: empresaId } });
    await prisma.velorios.create({
      data: {
        nome_falecido: 'Fulano', data_inicio: new Date(), data_fim: new Date(Date.now() + 3600_000),
        token_acesso: 'ABC123', sala_velorio_id: sala.id, empresa_id: empresaId, created_by: criador.id,
      },
    });
    await prisma.usuario_empresas.deleteMany({ where: { profile_id: criador.id } });
    const res = await request(app).get('/velorios/audit').set(authHeader(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data[0].created_by_email).toBe(criador.email);
  });
});
