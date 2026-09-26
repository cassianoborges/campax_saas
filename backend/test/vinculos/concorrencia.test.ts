import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const RODADAS = 5;

async function doisSuperadmins() {
  const empresa = await createEmpresa();
  const s1 = await createProfile({ role: 'superadmin', empresa_id: empresa.id });
  const s2 = await createProfile({ role: 'superadmin', empresa_id: empresa.id });
  return { empresa, s1, s2 };
}

function superadminsAtivos(empresaId: string) {
  return prisma.usuario_empresas.count({ where: { empresa_id: empresaId, profile: { role: 'superadmin', is_active: true } } });
}

// Rule U8 must hold under concurrency: two changes that each leave one superadmin can't both pass.
describe('regra do último superadmin (U8) com ações simultâneas', () => {
  it('plataforma desativa os dois superadmins ao mesmo tempo → só um passa', async () => {
    const h = authHeader(await createProfile({ role: 'platform_admin' }));
    for (let i = 0; i < RODADAS; i++) {
      const { empresa, s1, s2 } = await doisSuperadmins();
      const res = await Promise.all([s1, s2].map((s) => request(app).patch(`/platform/usuarios/${s.id}/ativo`).set(h).send({ is_active: false })));
      expect(res.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await superadminsAtivos(empresa.id)).toBe(1);
    }
  });

  it('plataforma rebaixa um e desvincula o outro ao mesmo tempo → só um passa', async () => {
    const h = authHeader(await createProfile({ role: 'platform_admin' }));
    for (let i = 0; i < RODADAS; i++) {
      const { empresa, s1, s2 } = await doisSuperadmins();
      const res = await Promise.all([
        request(app).patch(`/platform/usuarios/${s1.id}`).set(h).send({ role: 'admin' }),
        request(app).delete(`/platform/usuarios/${s2.id}/empresas/${empresa.id}`).set(h),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await superadminsAtivos(empresa.id)).toBe(1);
    }
  });

  it('superadmin e plataforma tiram um ao outro ao mesmo tempo → só um passa', async () => {
    const h = authHeader(await createProfile({ role: 'platform_admin' }));
    for (let i = 0; i < RODADAS; i++) {
      const { empresa, s1, s2 } = await doisSuperadmins();
      const res = await Promise.all([
        request(app).patch(`/users/${s2.id}/active`).set(authHeader(s1)).send({ is_active: false }),
        request(app).patch(`/platform/empresas/${empresa.id}/usuarios/${s1.id}/ativo`).set(h).send({ is_active: false }),
      ]);
      // The loser is refused by U8 (400) or, if s1 was deactivated first, by s1's own session (401).
      expect(res.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await superadminsAtivos(empresa.id)).toBe(1);
    }
  });
});
