import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '../prisma';

let io: SocketIOServer | null = null;

interface PresenceUser {
  nome?: string;
}

// velorioId -> socketId -> presence info (only sockets that called track() count)
const presenceRooms = new Map<string, Map<string, PresenceUser>>();

// Only join rooms of velórios that exist and whose empresa is active. Cached for a minute so a
// crowd joining the same velório costs one query.
const VALID_CACHE_MS = 60_000;
const validCache = new Map<string, { valid: boolean; at: number }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isValidVelorio(velorioId: unknown): Promise<boolean> {
  if (typeof velorioId !== 'string' || !UUID.test(velorioId)) return false;
  const cached = validCache.get(velorioId);
  if (cached && Date.now() - cached.at < VALID_CACHE_MS) return cached.valid;
  try {
    const velorio = await prisma.velorios.findUnique({ where: { id: velorioId }, select: { empresa: { select: { ativo: true } } } });
    const valid = !!velorio?.empresa.ativo;
    validCache.set(velorioId, { valid, at: Date.now() });
    return valid;
  } catch {
    return false;
  }
}

function presenceRoom(velorioId: string) {
  return `presence:${velorioId}`;
}

function broadcastPresence(velorioId: string) {
  const room = presenceRooms.get(velorioId);
  const users = room ? [...room.values()] : [];
  io?.to(presenceRoom(velorioId)).emit('presence:sync', { velorioId, count: users.length, users });
}

export function initRealtime(server: HttpServer, corsOrigin: string[]) {
  io = new SocketIOServer(server, { cors: { origin: corsOrigin } });

  io.on('connection', (socket: Socket) => {
    const joinedVelorioIds = new Set<string>();

    socket.on('presence:join', async ({ velorioId }: { velorioId: string }) => {
      if (!(await isValidVelorio(velorioId))) return;
      joinedVelorioIds.add(velorioId);
      socket.join(presenceRoom(velorioId));
      if (!presenceRooms.has(velorioId)) presenceRooms.set(velorioId, new Map());
      broadcastPresence(velorioId);
    });

    socket.on('presence:track', async ({ velorioId, nome }: { velorioId: string; nome?: string }) => {
      if (!(await isValidVelorio(velorioId))) return;
      if (!presenceRooms.has(velorioId)) presenceRooms.set(velorioId, new Map());
      presenceRooms.get(velorioId)!.set(socket.id, { nome });
      broadcastPresence(velorioId);
    });

    socket.on('homenagens:join', async ({ velorioId }: { velorioId: string }) => {
      if (await isValidVelorio(velorioId)) socket.join(`homenagens:${velorioId}`);
    });

    socket.on('disconnect', () => {
      for (const velorioId of joinedVelorioIds) {
        presenceRooms.get(velorioId)?.delete(socket.id);
        broadcastPresence(velorioId);
      }
    });
  });
}

export function emitHomenagensChanged(velorioId: string) {
  io?.to(`homenagens:${velorioId}`).emit('homenagens:changed');
}
