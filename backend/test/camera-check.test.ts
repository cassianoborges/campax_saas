import net from 'net';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { checkCameras, checkDefaults, clearCheckCache, parseRtspHost, validateCameraUrl } from '../src/lib/cameraCheck';
import { resetDb } from './helpers';
import { duasEmpresas, Fixture } from './isolamento/fixture';

describe('parseRtspHost', () => {
  it.each([
    ['rtsp://user:pass@203.0.113.5:5586/cam', { host: '203.0.113.5', port: 5586 }],
    ['rtsp://203.0.113.5/cam', { host: '203.0.113.5', port: 554 }],
    ['rtsp://admin:s3nh@@x:y@camera.example.com:8554/live', { host: 'camera.example.com', port: 8554 }],
    ['rtsps://[2001:db8::1]:322/x', { host: '2001:db8::1', port: 322 }],
  ])('%s', (url, expected) => expect(parseRtspHost(url)).toEqual(expected));

  it.each(['http://203.0.113.5/x', 'rtsp://', 'rtsp://host:99999/x', 'lixo'])('inválido: %s', (url) => {
    expect(parseRtspHost(url)).toBeNull();
  });
});

describe('endereços bloqueados', () => {
  it.each([
    'rtsp://127.0.0.1:5432/x', 'rtsp://10.0.0.5/x', 'rtsp://192.168.1.10/x', 'rtsp://172.18.0.1:3013/x',
    'rtsp://169.254.169.254/x', 'rtsp://[::1]/x', 'rtsp://[::ffff:127.0.0.1]/x', 'rtsp://localhost:9997/x',
  ])('%s não pode ser salvo', async (url) => {
    expect(await validateCameraUrl(url)).toBe('Endereço da câmera não permitido');
  });

  it('hostname que resolve para endereço interno é bloqueado, sem abrir conexão', async () => {
    const connect = vi.spyOn(net, 'connect');
    const results = await checkCameras([{ id: 'x', rtsp_url: 'rtsp://camera.example.com/x' }], {
      lookup: async () => ({ address: '10.1.2.3', family: 4 }),
    });
    expect(results.get('x')).toMatchObject({ online: false, error: 'Endereço não permitido' });
    expect(connect).not.toHaveBeenCalled();
    connect.mockRestore();
  });

  it('IP público é aceito', async () => {
    expect(await validateCameraUrl('rtsp://user:pass@203.0.113.5:5586/cam')).toBeNull();
  });
});

describe('checagem TCP', () => {
  let server: net.Server;
  let port: number;
  beforeEach(async () => {
    clearCheckCache();
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as net.AddressInfo).port;
  });
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // The only test that lifts the block list: it needs a server on localhost.
  const semBloqueio = { blockList: new net.BlockList() };

  it('online quando a porta aceita conexão, offline quando recusa', async () => {
    const results = await checkCameras(
      [{ id: 'on', rtsp_url: `rtsp://127.0.0.1:${port}/x` }, { id: 'off', rtsp_url: 'rtsp://127.0.0.1:1/x' }],
      semBloqueio,
    );
    expect(results.get('on')!.online).toBe(true);
    expect(results.get('off')!.online).toBe(false);
  });

  it('duas chamadas seguidas: uma conexão por câmera (cache de 30 s)', async () => {
    let conexoes = 0;
    server.on('connection', () => conexoes++);
    const cameras = [{ id: 'c', rtsp_url: `rtsp://127.0.0.1:${port}/x` }];
    await checkCameras(cameras, semBloqueio);
    await checkCameras(cameras, semBloqueio);
    expect(conexoes).toBe(1);
  });
});

describe('rotas de câmera', () => {
  let f: Fixture;
  beforeEach(async () => {
    clearCheckCache();
    await resetDb();
    f = await duasEmpresas();
  });
  afterEach(() => {
    checkDefaults.blockList = undefined;
  });
  afterAll(() => prisma.$disconnect());

  it('POST/PATCH com endereço interno → 400', async () => {
    const h = f.as(f.A.users.operador);
    const post = await request(app).post('/cameras').set(h).send({ nome: 'X', rtsp_url: 'rtsp://127.0.0.1:5432/x' });
    expect(post.status).toBe(400);
    const patch = await request(app).patch(`/cameras/${f.A.camera.id}`).set(h).send({ rtsp_url: 'rtsp://10.0.0.1/x' });
    expect(patch.status).toBe(400);
  });

  it('check-status grava status e status_checked_at só das câmeras da empresa', async () => {
    const server = net.createServer((s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    checkDefaults.blockList = new net.BlockList();
    await prisma.cameras.update({ where: { id: f.A.camera.id }, data: { rtsp_url: `rtsp://127.0.0.1:${port}/x` } });

    const res = await request(app).post('/cameras/check-status').set(f.as(f.A.users.viewer)).send({});
    server.close();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual([f.A.camera.id]);
    expect(JSON.stringify(res.body)).not.toContain('rtsp');
    const camera = await prisma.cameras.findUnique({ where: { id: f.A.camera.id } });
    expect(camera).toMatchObject({ status: 'online' });
    expect(camera!.status_checked_at).toBeInstanceOf(Date);
  });

  it('a rota antiga POST /cameras/bulk-status não existe mais', async () => {
    const res = await request(app).post('/cameras/bulk-status').set(f.as(f.A.users.operador)).send({ [f.A.camera.id]: true });
    expect(res.status).toBe(404);
  });
});
