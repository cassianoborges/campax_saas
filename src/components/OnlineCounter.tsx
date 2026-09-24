import { usePresence } from '@/hooks/usePresence';

const MAX_AVATARS = 3;

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-amber-500',
  'bg-emerald-600',
  'bg-sky-600',
  'bg-rose-600',
  'bg-violet-600',
];

function colorFor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

interface OnlineCounterProps {
  velorio_id: string;
}

export function OnlineCounter({ velorio_id }: OnlineCounterProps) {
  const { count, users } = usePresence(velorio_id);

  const named = users.filter((u) => u.nome);
  const avatarUsers = named.slice(0, MAX_AVATARS);
  const overflow = count - avatarUsers.length;

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-black/65 backdrop-blur-sm text-white px-3 py-1.5 rounded-full pointer-events-none shadow-lg">
      {/* Avatar stack */}
      {avatarUsers.length > 0 && (
        <div className="flex -space-x-2">
          {avatarUsers.map((u, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full ${colorFor(i)} flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-black/40`}
              title={u.nome}
            >
              {getInitials(u.nome!)}
            </div>
          ))}
          {overflow > 0 && (
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-black/40">
              +{overflow}
            </div>
          )}
        </div>
      )}

      {/* Pulse dot + label */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
        </span>
        <span className="text-xs font-medium tracking-wide">
          {count} Online
        </span>
      </div>
    </div>
  );
}
