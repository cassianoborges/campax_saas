import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { UPLOADS_DIR } from '../../src/lib/uploads';
import { resetDb, TEST_PASSWORD } from '../helpers';
import { duasEmpresas, Fixture } from '../isolamento/fixture';

let f: Fixture;
const criadas: string[] = [];

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterEach(() => {
  for (const id of [f.A.empresa.id, f.B.empresa.id, ...criadas.splice(0)]) {
    fs.rmSync(path.join(UPLOADS_DIR, id), { recursive: true, force: true });
  }
});
afterAll(() => prisma.$disconnect());

const plat = () => f.as(f.platformAdmin);
const novaEmpresa = (overrides: Record<string, unknown> = {}) => ({
  empresa: { nome: 'Funerária São José', nome_exibicao: 'São José', cor_primaria: '#2E8B57', ...overrides },
  superadmin: { email: 'dono@saojose.example.com', password: 'senha-forte-1', full_name: 'Dono' },
});

describe('acesso ao /platform', () => {
  it.each(['superadmin', 'admin', 'operador', 'viewer'] as const)('%s de empresa → 403', async (role) => {
    const res = await request(app).get('/platform/empresas').set(f.as(f.A.users[role]));
    expect(res.status).toBe(403);
  });

  it('sem token → 401', async () => {
    expect((await request(app).get('/platform/empresas')).status).toBe(401);
  });
});

describe('empresas', () => {
  it('lista empresas com o uso de cada uma', async () => {
    const res = await request(app).get('/platform/empresas').set(plat());
    expect(res.status).toBe(200);
    const a = res.body.data.find((e: { id: string }) => e.id === f.A.empresa.id);
    expect(a.uso).toEqual({ usuarios: 4, cameras: 1, salas: 1, velorios: 1, velorios_ao_vivo: 1, acessos_30d: 1 });
  });

  it('cria empresa + superadmin; o superadmin loga e vê a empresa vazia', async () => {
    const res = await request(app).post('/platform/empresas').set(plat()).send(novaEmpresa());
    expect(res.status).toBe(200);
    const empresa = res.body.data;
    criadas.push(empresa.id);
    expect(empresa).toMatchObject({ slug: 'funeraria-sao-jose', ativo: true, cor_primaria: '#2E8B57' });
    expect(empresa.hash_publico).toMatch(/^[a-z0-9]{8}$/);

    const login = await request(app).post('/auth/login').send({ email: 'dono@saojose.example.com', password: 'senha-forte-1' });
    expect(login.status).toBe(200);
    expect(login.body.empresa.id).toBe(empresa.id);
    const velorios = await request(app).get('/velorios').set({ Authorization: `Bearer ${login.body.token}` });
    expect(velorios.body.data).toEqual([]);
  });

  it('e-mail duplicado → 409 e nenhuma empresa criada (P3)', async () => {
    const antes = await prisma.empresas.count();
    const body = novaEmpresa();
    body.superadmin.email = f.A.users.viewer.email;
    const res = await request(app).post('/platform/empresas').set(plat()).send(body);
    expect(res.status).toBe(409);
    expect(await prisma.empresas.count()).toBe(antes);
  });

  it('slug duplicado → 409; slug inválido → 400', async () => {
    const dup = await request(app).post('/platform/empresas').set(plat()).send(novaEmpresa({ slug: f.A.empresa.slug }));
    expect(dup.status).toBe(409);
    const invalido = await request(app).post('/platform/empresas').set(plat()).send(novaEmpresa({ slug: 'Com Espaço' }));
    expect(invalido.status).toBe(400);
  });

  it('cor inválida → 400', async () => {
    const res = await request(app).post('/platform/empresas').set(plat()).send(novaEmpresa({ cor_primaria: 'verde' }));
    expect(res.status).toBe(400);
  });

  it('telefone e endereço: criados, editados e devolvidos; CEP normalizado', async () => {
    const endereco = {
      telefone: '(11) 3333-4444', endereco_cep: '01310100', endereco_logradouro: 'Av. Paulista',
      endereco_numero: '1000', endereco_complemento: 'Sala 1', endereco_bairro: 'Bela Vista',
      endereco_cidade: 'São Paulo', endereco_uf: 'sp',
    };
    const criada = await request(app).post('/platform/empresas').set(plat()).send(novaEmpresa(endereco));
    expect(criada.status).toBe(200);
    criadas.push(criada.body.data.id);
    expect(criada.body.data).toMatchObject({ ...endereco, endereco_cep: '01310-100', endereco_uf: 'SP' });

    const editada = await request(app).patch(`/platform/empresas/${criada.body.data.id}`).set(plat())
      .send({ endereco_cidade: 'Campinas', endereco_complemento: '', telefone: '  ' });
    expect(editada.status).toBe(200);
    expect(editada.body.data).toMatchObject({ endereco_cidade: 'Campinas', endereco_complemento: null, telefone: null, endereco_uf: 'SP' });
  });

  it('endereço não aparece na página pública', async () => {
    await request(app).patch(`/platform/empresas/${f.A.empresa.id}`).set(plat()).send({ endereco_cidade: 'Campinas', telefone: '1133334444' });
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Campinas');
    expect(JSON.stringify(res.body)).not.toContain('1133334444');
  });

  it.each([
    ['UF inexistente', { endereco_uf: 'XX' }],
    ['CEP com poucos dígitos', { endereco_cep: '1234' }],
  ])('%s → 400', async (_nome, campos) => {
    const res = await request(app).patch(`/platform/empresas/${f.A.empresa.id}`).set(plat()).send(campos);
    expect(res.status).toBe(400);
  });

  it('PATCH não altera slug nem hash_publico (P1)', async () => {
    const res = await request(app)
      .patch(`/platform/empresas/${f.A.empresa.id}`)
      .set(plat())
      .send({ slug: 'outro', hash_publico: 'zzzzzzzz', nome_exibicao: 'Novo nome', ativo: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: f.A.empresa.slug, hash_publico: f.A.empresa.hash_publico, nome_exibicao: 'Novo nome', ativo: true });
  });

  it('suspender bloqueia login e páginas públicas; reativar volta', async () => {
    const suspender = await request(app).patch(`/platform/empresas/${f.A.empresa.id}/ativo`).set(plat()).send({ ativo: false });
    expect(suspender.body.velorios_ao_vivo).toBe(1);
    const login = await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: TEST_PASSWORD });
    expect(login.status).toBe(403);
    expect((await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`)).status).toBe(404);

    await request(app).patch(`/platform/empresas/${f.A.empresa.id}/ativo`).set(plat()).send({ ativo: true });
    expect((await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: TEST_PASSWORD })).status).toBe(200);
    expect((await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`)).status).toBe(200);
  });

  it('empresa inexistente → 404', async () => {
    expect((await request(app).get('/platform/empresas/00000000-0000-0000-0000-000000000000').set(plat())).status).toBe(404);
  });
});

describe('logo (P5)', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const upload = (buffer: Buffer, filename: string, contentType: string) =>
    request(app).post(`/platform/empresas/${f.A.empresa.id}/logo`).set(plat()).attach('file', buffer, { filename, contentType });

  it('PNG aceito, gravado em uploads/<empresa>/branding e refletido no público', async () => {
    const res = await upload(png, 'logo.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.data.logo_url).toMatch(new RegExp(`/files/${f.A.empresa.id}/branding/logo-\\d+\\.png$`));
    const pub = await request(app).get(`/public/empresas/${f.A.empresa.hash_publico}`);
    expect(pub.body.data.logo_url).toBe(res.body.data.logo_url);
  });

  it('SVG rejeitado', async () => {
    const res = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg', 'image/svg+xml');
    expect(res.status).toBe(400);
  });

  it('acima de 2 MB rejeitado', async () => {
    const res = await upload(Buffer.alloc(2 * 1024 * 1024 + 1), 'grande.png', 'image/png');
    expect(res.status).toBe(400);
  });

  it('DELETE limpa o logo', async () => {
    await upload(png, 'logo.png', 'image/png');
    const res = await request(app).delete(`/platform/empresas/${f.A.empresa.id}/logo`).set(plat());
    expect(res.body.data.logo_url).toBeNull();
  });
});

describe('usuários de uma empresa', () => {
  it('cria usuário na empresa; platform_admin como papel → 400', async () => {
    const ok = await request(app).post(`/platform/empresas/${f.A.empresa.id}/usuarios`).set(plat())
      .send({ email: 'novo@a.example.com', password: 'senha-forte-1', role: 'operador' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ role: 'operador' });
    expect(ok.body.data.password_hash).toBeUndefined();
    const vinculo = await prisma.usuario_empresas.findUnique({ where: { profile_id_empresa_id: { profile_id: ok.body.data.id, empresa_id: f.A.empresa.id } } });
    expect(vinculo).toBeTruthy();

    const plat5 = await request(app).post(`/platform/empresas/${f.A.empresa.id}/usuarios`).set(plat())
      .send({ email: 'x@a.example.com', password: 'senha-forte-1', role: 'platform_admin' });
    expect(plat5.status).toBe(400);
  });

  it('usuário de outra empresa pela URL de A → 404', async () => {
    const res = await request(app).patch(`/platform/empresas/${f.A.empresa.id}/usuarios/${f.B.users.viewer.id}/senha`).set(plat())
      .send({ password: 'nova-senha-123' });
    expect(res.status).toBe(404);
  });

  it('redefinir senha funciona', async () => {
    await request(app).patch(`/platform/empresas/${f.A.empresa.id}/usuarios/${f.A.users.viewer.id}/senha`).set(plat())
      .send({ password: 'nova-senha-123' });
    const login = await request(app).post('/auth/login').send({ email: f.A.users.viewer.email, password: 'nova-senha-123' });
    expect(login.status).toBe(200);
  });

  it('não desativa o último superadmin ativo', async () => {
    const res = await request(app).patch(`/platform/empresas/${f.A.empresa.id}/usuarios/${f.A.users.superadmin.id}/ativo`).set(plat())
      .send({ is_active: false });
    expect(res.status).toBe(400);
    const outro = await request(app).patch(`/platform/empresas/${f.A.empresa.id}/usuarios/${f.A.users.admin.id}/ativo`).set(plat())
      .send({ is_active: false });
    expect(outro.status).toBe(200);
  });
});

describe('modelos de homenagem globais (D6)', () => {
  it('criado aqui aparece para A e B, somente leitura para elas', async () => {
    const criado = await request(app).post('/platform/homenagens-templates').set(plat()).send({ titulo: 'Global novo', mensagem: 'Texto' });
    expect(criado.body.data.empresa_id).toBeNull();
    for (const empresa of [f.A, f.B]) {
      const lista = await request(app).get('/homenagens-templates').set(f.as(empresa.users.viewer));
      expect(lista.body.data.map((t: { id: string }) => t.id)).toContain(criado.body.data.id);
    }
    const editarPelaEmpresa = await request(app).patch(`/homenagens-templates/${criado.body.data.id}`).set(f.as(f.A.users.admin)).send({ titulo: 'x' });
    expect(editarPelaEmpresa.status).toBe(404);
  });

  it('o /platform não edita modelos de uma empresa', async () => {
    const res = await request(app).patch(`/platform/homenagens-templates/${f.A.template.id}`).set(plat()).send({ titulo: 'x' });
    expect(res.status).toBe(404);
  });
});
