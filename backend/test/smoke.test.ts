import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { authHeader, createProfile, resetDb, TEST_PASSWORD } from './helpers';

describe('smoke', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('login devolve um token para um usuário válido', async () => {
    const profile = await createProfile({ role: 'admin' });
    const res = await request(app).post('/auth/login').send({ email: profile.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.profile.password_hash).toBeUndefined();
  });

  it('login com senha errada responde 401', async () => {
    const profile = await createProfile();
    const res = await request(app).post('/auth/login').send({ email: profile.email, password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('rota autenticada sem token responde 401', async () => {
    const res = await request(app).get('/cameras');
    expect(res.status).toBe(401);
  });

  it('rota autenticada com token responde 200', async () => {
    const profile = await createProfile({ role: 'viewer' });
    const res = await request(app).get('/cameras').set(authHeader(profile));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
