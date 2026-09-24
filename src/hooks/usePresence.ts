import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export interface PresenceUser {
  nome?: string;
}

export interface PresenceState {
  count: number;
  users: PresenceUser[];
}

const VISITOR_KEY = 'campax_visitor';

function getSavedNome(): string | undefined {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw)?.nome : undefined;
  } catch {
    return undefined;
  }
}

export function usePresence(velorio_id: string): PresenceState {
  const [state, setState] = useState<PresenceState>({ count: 0, users: [] });

  useEffect(() => {
    if (!velorio_id) return;

    const socket = getSocket();

    const handleSync = (payload: PresenceState & { velorioId: string }) => {
      if (payload.velorioId === velorio_id) setState(payload);
    };
    socket.on('presence:sync', handleSync);

    socket.emit('presence:join', { velorioId: velorio_id });
    socket.emit('presence:track', { velorioId: velorio_id, nome: getSavedNome() });

    return () => {
      socket.off('presence:sync', handleSync);
    };
  }, [velorio_id]);

  return state;
}
