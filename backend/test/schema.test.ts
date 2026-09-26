import { randomUUID } from 'crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma';
import { createEmpresa, createProfile, resetDb } from './helpers';

// Regras de isolamento garantidas pelo próprio banco (001_multiempresa.sql), independentes do backend.

async function createSala(empresa_id: string, slug = `sala-${randomUUID().slice(0, 8)}`) {
  return prisma.sala_velorio.create({ data: { nome_sala_velorio: 'Sala', slug, empresa_id } });
}

async function createVelorio(empresa_id: string, sala_velorio_id: string) {
  const inicio = new Date();
  return prisma.velorios.create({
    data: {
      nome_falecido: 'Fulano',
      data_inicio: inicio,
      data_fim: new Date(inicio.getTime() + 3600_000),
      token_acesso: randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
      empresa_id,
      sala_velorio_id,
    },
  });
}

describe('schema multiempresa', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('velório não pode usar sala de outra empresa (FK composta)', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    const salaB = await createSala(b.id);
    await expect(createVelorio(a.id, salaB.id)).rejects.toThrow();
    await expect(createVelorio(b.id, salaB.id)).resolves.toBeTruthy();
  });

  it('velório pode ser criado sem created_by (trigger do Supabase removido)', async () => {
    const a = await createEmpresa();
    const velorio = await createVelorio(a.id, (await createSala(a.id)).id);
    expect(velorio.created_by).toBeNull();
  });

  it('log de acesso não pode ter empresa diferente da do velório', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    const velorioA = await createVelorio(a.id, (await createSala(a.id)).id);
    const log = { velorio_id: velorioA.id, token_acesso: velorioA.token_acesso };
    await expect(prisma.velorio_access_logs.create({ data: { ...log, empresa_id: b.id } })).rejects.toThrow();
    await expect(prisma.velorio_access_logs.create({ data: { ...log, empresa_id: a.id } })).resolves.toBeTruthy();
  });

  it('slug de sala é único por empresa, não no sistema todo', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    await createSala(a.id, 'sala-1');
    await expect(createSala(b.id, 'sala-1')).resolves.toBeTruthy();
    await expect(createSala(a.id, 'sala-1')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('mediamtx_path é único no sistema todo', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    const camera = { nome: 'Câmera', rtsp_url: 'rtsp://example.com/x', mediamtx_path: 'caminho-unico' };
    await prisma.cameras.create({ data: { ...camera, empresa_id: a.id } });
    await expect(prisma.cameras.create({ data: { ...camera, empresa_id: b.id } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('platform_admin nunca tem vínculo (triggers do 003)', async () => {
    const a = await createEmpresa();
    const plat = await createProfile({ role: 'platform_admin' });
    await expect(prisma.usuario_empresas.create({ data: { profile_id: plat.id, empresa_id: a.id } })).rejects.toThrow(
      /usuario_empresas_sem_platform_admin/,
    );
    const admin = await createProfile({ role: 'admin', empresa_id: a.id });
    await expect(prisma.profiles.update({ where: { id: admin.id }, data: { role: 'platform_admin' } })).rejects.toThrow(
      /profiles_platform_admin_sem_vinculo/,
    );
    const semEmpresa = await createProfile({ role: 'admin', empresa_id: null });
    await expect(prisma.usuario_empresas.count({ where: { profile_id: semEmpresa.id } })).resolves.toBe(0);
  });

  it('empresa com usuário vinculado não pode ser apagada; apagar o usuário apaga o vínculo', async () => {
    const a = await createEmpresa();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    await expect(prisma.empresas.delete({ where: { id: a.id } })).rejects.toThrow();
    await prisma.profiles.delete({ where: { id: user.id } });
    await expect(prisma.usuario_empresas.count({ where: { empresa_id: a.id } })).resolves.toBe(0);
  });

  it('empresa com dados não pode ser apagada (RESTRICT)', async () => {
    const a = await createEmpresa();
    await createSala(a.id);
    await expect(prisma.empresas.delete({ where: { id: a.id } })).rejects.toThrow();
  });

  it('formato de slug, hash e cores é validado pelo banco', async () => {
    const base = { nome: 'X', nome_exibicao: 'X' };
    await expect(prisma.empresas.create({ data: { ...base, slug: 'Com Espaço', hash_publico: 'abcdef12' } })).rejects.toThrow();
    await expect(prisma.empresas.create({ data: { ...base, slug: 'ok', hash_publico: 'ABC' } })).rejects.toThrow();
    await expect(
      prisma.empresas.create({ data: { ...base, slug: 'ok', hash_publico: 'abcdef12', cor_primaria: 'azul' } }),
    ).rejects.toThrow();
  });
});
