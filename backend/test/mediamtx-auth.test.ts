import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { signStreamToken } from '../src/lib/streamToken';
import { signToken } from '../src/auth/jwt';
import { resetDb } from './helpers';
import { duasEmpresas, Fixture } from './isolamento/fixture';

// MediaMTX HTTP auth (spec 06, part B): who may read which camera, and the control API.
let f: Fixture;
const AUTH_URL = '/internal/mediamtx/auth/chave-de-teste';
const read = (path: string, query = '') => ({ action: 'read', path, protocol: 'webrtc', query, ip: '203.0.113.9' });

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
  await prisma.cameras.update({ where: { id: f.A.camera.id }, data: { mediamtx_path: 'empresa-a-aaaaaaaaaa', webrtc_url: 'https://media.example.com/empresa-a-aaaaaaaaaa' } });
  await prisma.cameras.update({ where: { id: f.B.camera.id }, data: { mediamtx_path: 'empresa-b-bbbbbbbbbb', webrtc_url: 'https://media.example.com/empresa-b-bbbbbbbbbb' } });
});
afterAll(() => prisma.$disconnect());

const tokenA = () => signStreamToken({ v: f.A.velorio.id, p: ['empresa-a-aaaaaaaaaa'] }, '1h');

describe('/internal/mediamtx/auth', () => {
  it('chave errada ou requisição vinda pelo proxy público → 404', async () => {
    expect((await request(app).post('/internal/mediamtx/auth/errada').send(read('empresa-a-aaaaaaaaaa'))).status).toBe(404);
    const viaProxy = await request(app).post(AUTH_URL).set('X-Forwarded-For', '198.51.100.1').send(read('empresa-a-aaaaaaaaaa', `t=${tokenA()}`));
    expect(viaProxy.status).toBe(404);
  });

  it('leitura sem token → negada', async () => {
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa'))).status).toBe(401);
  });

  it('leitura com token do velório ao vivo → permitida (com outros parâmetros na query)', async () => {
    const res = await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', `controls=false&t=${encodeURIComponent(tokenA())}`));
    expect(res.status).toBe(200);
  });

  it('token de um velório não abre câmera de outra empresa', async () => {
    expect((await request(app).post(AUTH_URL).send(read('empresa-b-bbbbbbbbbb', `t=${tokenA()}`))).status).toBe(401);
  });

  it('fora do horário do velório (além da margem) → negada', async () => {
    const longe = new Date(Date.now() - 2 * 24 * 3600_000);
    await prisma.velorios.update({ where: { id: f.A.velorio.id }, data: { data_inicio: longe, data_fim: new Date(longe.getTime() + 3600_000) } });
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', `t=${tokenA()}`))).status).toBe(401);
  });

  it('empresa suspensa ou câmera desativada → negada', async () => {
    await prisma.cameras.update({ where: { id: f.A.camera.id }, data: { ativo: false } });
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', `t=${tokenA()}`))).status).toBe(401);
    await prisma.cameras.update({ where: { id: f.A.camera.id }, data: { ativo: true } });
    await prisma.empresas.update({ where: { id: f.A.empresa.id }, data: { ativo: false } });
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', `t=${tokenA()}`))).status).toBe(401);
  });

  it('token de login não serve como token de transmissão', async () => {
    const login = signToken({ sub: f.A.users.admin.id });
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', `t=${login}`))).status).toBe(401);
  });

  it('API: só com as credenciais do .env; publish/playback/metrics sempre negados', async () => {
    expect((await request(app).post(AUTH_URL).send({ action: 'api', user: 'api-teste', password: 'senha-api-teste' })).status).toBe(200);
    expect((await request(app).post(AUTH_URL).send({ action: 'api', user: 'api-teste', password: 'errada' })).status).toBe(401);
    expect((await request(app).post(AUTH_URL).send({ action: 'api' })).status).toBe(401);
    for (const action of ['publish', 'playback', 'metrics', 'pprof']) {
      const res = await request(app).post(AUTH_URL).send({ action, path: 'empresa-a-aaaaaaaaaa', user: 'api-teste', password: 'senha-api-teste', query: `t=${tokenA()}` });
      expect(res.status, action).toBe(401);
    }
  });
});

describe('stream_url nas rotas públicas e no preview do admin', () => {
  it('a página pública recebe stream_url com um token que o /internal aceita', async () => {
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    const camera = res.body.data.sala.sala_velorio_cameras[0].cameras;
    expect(camera.mediamtx_path).toBeUndefined();
    expect(camera.stream_url).toMatch(/^https:\/\/media\.example\.com\/empresa-a-aaaaaaaaaa\/\?t=/);
    const query = new URL(camera.stream_url).search.slice(1);
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', query))).status).toBe(200);
  });

  it('velório fora do horário: nenhum stream_url (evita o pedido de login do MediaMTX)', async () => {
    const amanha = new Date(Date.now() + 24 * 3600_000);
    await prisma.velorios.update({ where: { id: f.A.velorio.id }, data: { data_inicio: amanha, data_fim: new Date(amanha.getTime() + 3600_000) } });
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    expect(res.body.data.sala.sala_velorio_cameras[0].cameras.stream_url).toBeNull();
  });

  it('o token vale até o fim do velório (+ margem), não um prazo fixo', async () => {
    const fim = new Date(Date.now() + 20 * 3600_000);
    await prisma.velorios.update({ where: { id: f.A.velorio.id }, data: { data_fim: fim } });
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    const token = new URL(res.body.data.sala.sala_velorio_cameras[0].cameras.stream_url).searchParams.get('t')!;
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp * 1000;
    expect(exp).toBeGreaterThan(fim.getTime());
    expect(exp).toBeLessThanOrEqual(fim.getTime() + 31 * 60_000);
  });

  it('preview do admin: só câmeras da própria empresa', async () => {
    const h = f.as(f.A.users.viewer);
    const ok = await request(app).post(`/cameras/${f.A.camera.id}/stream-url`).set(h);
    expect(ok.status).toBe(200);
    const query = new URL(ok.body.url).search.slice(1);
    expect((await request(app).post(AUTH_URL).send(read('empresa-a-aaaaaaaaaa', query))).status).toBe(200);
    expect((await request(app).post(`/cameras/${f.B.camera.id}/stream-url`).set(h)).status).toBe(404);
  });
});
