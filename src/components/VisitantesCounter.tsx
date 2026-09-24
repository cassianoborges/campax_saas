import { useState } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useVisitantesPublic } from '@/hooks/useVisitantes';

interface VisitantesCounterProps {
  velorio_id: string;
}

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function VisitantesCounter({ velorio_id }: VisitantesCounterProps) {
  const [open, setOpen] = useState(false);
  const { data: visitantes, isLoading } = useVisitantesPublic(velorio_id);

  const unique = visitantes
    ? Array.from(
        new Map(visitantes.map((v) => [v.nome.trim().toLowerCase(), v])).values()
      )
    : [];
  const count = unique.length;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-cream/70 hover:text-gold hover:bg-white/5 gap-1.5 px-2"
        onClick={() => setOpen(true)}
      >
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">
          {count} {count === 1 ? 'Presença' : 'Presenças'}
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="bg-primary border-gold/20 text-cream w-80 flex flex-col"
        >
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="text-cream font-heading text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" />
              Livro de Presenças
            </SheetTitle>
            <p className="text-cream/50 text-sm">
              {count === 0
                ? 'Nenhuma presença registrada'
                : count === 1
                ? '1 pessoa esteve presente'
                : `${count} pessoas estiveram presentes`}
            </p>
          </SheetHeader>

          <div className="mt-4 flex-1 overflow-y-auto space-y-1 pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-cream/40">
                <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            ) : unique.length > 0 ? (
              unique.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-2.5 border-b border-gold/10 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-xs font-bold flex-shrink-0">
                    {getInitials(v.nome)}
                  </div>
                  <p className="text-cream text-sm font-medium truncate">{v.nome}</p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-cream/30">
                <Users className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">Nenhuma presença ainda</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
