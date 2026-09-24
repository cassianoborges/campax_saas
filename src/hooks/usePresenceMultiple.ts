import { useState, useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { PresenceUser, PresenceState } from './usePresence';

export type PresenceMap = Map<string, PresenceState>;

export function usePresenceMultiple(velorio_ids: string[]): PresenceMap {
  const [map, setMap] = useState<PresenceMap>(new Map());
  // stable key so the effect doesn't re-run on every render
  const key = [...velorio_ids].sort().join(',');
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (velorio_ids.length === 0) return;

    const socket = getSocket();

    const handleSync = (payload: PresenceState & { velorioId: string }) => {
      if (!velorio_ids.includes(payload.velorioId)) return;
      setMap((prev) => {
        const next = new Map(prev);
        next.set(payload.velorioId, { count: payload.count, users: payload.users });
        return next;
      });
    };

    socket.on('presence:sync', handleSync);
    // Admin only observes — joins without track() so they're not counted.
    velorio_ids.forEach((id) => socket.emit('presence:join', { velorioId: id }));

    return () => {
      socket.off('presence:sync', handleSync);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
