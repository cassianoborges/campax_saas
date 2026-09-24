import { randomUUID } from 'crypto';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile } from '../helpers';

// Two fully populated empresas (A and B) plus a global template and a platform_admin. Isolation
// tests always act as a user of A and aim at B's data.

async function popularEmpresa(label: string) {
  const empresa = await createEmpresa({ nome: `Empresa ${label}` });
  const e = empresa.id;
  const users = {
    superadmin: await createProfile({ role: 'superadmin', empresa_id: e }),
    admin: await createProfile({ role: 'admin', empresa_id: e }),
    operador: await createProfile({ role: 'operador', empresa_id: e }),
    viewer: await createProfile({ role: 'viewer', empresa_id: e }),
  };
  const camera = await prisma.cameras.create({
    data: { nome: `Câmera ${label}`, rtsp_url: `rtsp://user:senha@camera-${label.toLowerCase()}.example.com:554/x`, empresa_id: e },
  });
  // Same slug in both empresas on purpose (slugs are unique per empresa only).
  const sala = await prisma.sala_velorio.create({ data: { nome_sala_velorio: `Sala ${label}`, slug: 'sala-1', empresa_id: e } });
  await prisma.sala_velorio_cameras.create({ data: { sala_velorio_id: sala.id, camera_id: camera.id } });
  const inicio = new Date(Date.now() - 3600_000);
  const velorio = await prisma.velorios.create({
    data: {
      nome_falecido: `Falecido ${label}`,
      data_inicio: inicio,
      data_fim: new Date(inicio.getTime() + 4 * 3600_000),
      token_acesso: randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
      sala_velorio_id: sala.id,
      empresa_id: e,
      created_by: users.operador.id,
    },
  });
  const homenagem = await prisma.velorio_homenagens.create({ data: { velorio_id: velorio.id, autor_nome: `Autor ${label}`, mensagem: 'Descanse em paz' } });
  const visitante = await prisma.velorio_visitantes.create({ data: { velorio_id: velorio.id, nome: `Visitante ${label}`, celular: '11999990000' } });
  const accessLog = await prisma.velorio_access_logs.create({ data: { velorio_id: velorio.id, empresa_id: e, token_acesso: velorio.token_acesso } });
  const termo = await prisma.terms_acceptances.create({
    data: { velorio_id: velorio.id, empresa_id: e, nome: 'Visitante', celular: `celular-${label}`, terms_version: '1.0', document_hash: 'hash' },
  });
  const template = await prisma.homenagens_templates.create({ data: { titulo: `Modelo ${label}`, mensagem: 'Texto', empresa_id: e } });

  return { empresa, users, camera, sala, velorio, homenagem, visitante, accessLog, termo, template };
}

export async function duasEmpresas() {
  const A = await popularEmpresa('A');
  const B = await popularEmpresa('B');
  const templateGlobal = await prisma.homenagens_templates.create({ data: { titulo: 'Modelo global', mensagem: 'Texto', empresa_id: null } });
  const platformAdmin = await createProfile({ role: 'platform_admin' });
  return { A, B, templateGlobal, platformAdmin, as: authHeader };
}

export type Fixture = Awaited<ReturnType<typeof duasEmpresas>>;

/** Every id found anywhere in a JSON response body. */
export function idsIn(body: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if ((key === 'id' || key.endsWith('_id')) && typeof v === 'string') ids.add(v);
        walk(v);
      }
    }
  };
  walk(body);
  return ids;
}

/** All ids that belong to an empresa's fixture data (to assert none of them leaks). */
export function idsOf(empresa: Awaited<ReturnType<typeof popularEmpresa>>): string[] {
  return [
    empresa.empresa.id, empresa.camera.id, empresa.sala.id, empresa.velorio.id, empresa.homenagem.id,
    empresa.visitante.id, empresa.accessLog.id, empresa.termo.id, empresa.template.id,
    ...Object.values(empresa.users).map((u) => u.id),
  ];
}
