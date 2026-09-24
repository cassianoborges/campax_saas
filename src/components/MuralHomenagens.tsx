import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, Send, Info } from 'lucide-react';
import { useHomenagens, useSubmitHomenagem } from '@/hooks/useHomenagens';
import { useToast } from '@/hooks/use-toast';
import { getSavedVisitor } from '@/lib/visitorStorage';

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MuralHomenagensProps {
  velorio_id: string;
}

export function MuralHomenagens({ velorio_id }: MuralHomenagensProps) {
  const [mensagem, setMensagem] = useState('');
  const [parentesco, setParentesco] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const visitor = getSavedVisitor();

  const { data: homenagens = [], isLoading } = useHomenagens(velorio_id);
  const { mutate: submitHomenagem, isPending } = useSubmitHomenagem();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [homenagens.length]);

  const handleSubmit = () => {
    if (!mensagem.trim()) {
      toast({
        title: 'Mensagem vazia',
        description: 'Escreva uma mensagem antes de enviar.',
        variant: 'destructive',
      });
      return;
    }

    if (!visitor) return;

    submitHomenagem(
      {
        velorio_id,
        autor_nome: visitor.nome,
        parentesco: parentesco.trim() || undefined,
        mensagem: mensagem.trim(),
      },
      {
        onSuccess: () => {
          setMensagem('');
          setParentesco('');
        },
        onError: () => {
          toast({
            title: 'Erro ao enviar',
            description: 'Não foi possível enviar sua mensagem. Tente novamente.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-full bg-primary/50 backdrop-blur-sm border border-gold/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gold/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-gold" />
          <span className="text-cream font-heading text-sm uppercase tracking-wider">
            Homenagens e Condolências
          </span>
        </div>
        <Badge variant="outline" className="text-gold border-gold/40 text-xs">
          {homenagens.length}
        </Badge>
      </div>

      {/* Message list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-4">
          {isLoading && (
            <p className="text-cream/40 text-sm text-center py-4">Carregando...</p>
          )}

          {!isLoading && homenagens.length === 0 && (
            <div className="text-center py-8">
              <Heart className="w-8 h-8 text-cream/20 mx-auto mb-2" />
              <p className="text-cream/40 text-sm">
                Seja o primeiro a deixar uma homenagem.
              </p>
            </div>
          )}

          {homenagens.map((h) => (
            <div key={h.id} className="flex gap-3">
              <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                <AvatarFallback className="bg-gold/20 text-gold text-xs font-medium">
                  {getInitials(h.autor_nome)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-cream text-sm font-medium">
                    {h.autor_nome}
                  </span>
                  {h.parentesco && (
                    <span className="text-cream/50 text-xs">({h.parentesco})</span>
                  )}
                  <span className="text-cream/30 text-xs ml-auto flex-shrink-0">
                    {formatTimestamp(h.created_at)}
                  </span>
                </div>
                <p className="text-cream/80 text-sm mt-0.5 leading-relaxed break-words">
                  {h.mensagem}
                </p>
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gold/10 flex-shrink-0">
        {visitor ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarFallback className="bg-gold/20 text-gold text-xs">
                  {getInitials(visitor.nome)}
                </AvatarFallback>
              </Avatar>
              <span className="text-cream/60 text-xs">{visitor.nome}</span>
              <Input
                placeholder="Parentesco (opcional)"
                value={parentesco}
                onChange={(e) => setParentesco(e.target.value)}
                className="h-6 text-xs bg-white/5 border-white/10 text-cream placeholder:text-cream/30 flex-1"
                maxLength={30}
              />
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Escreva uma mensagem de carinho..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className="resize-none text-sm bg-white/5 border-white/10 text-cream placeholder:text-cream/30 min-h-[60px]"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
                }}
              />
              <Button
                onClick={handleSubmit}
                disabled={isPending || !mensagem.trim()}
                size="sm"
                variant="gold"
                className="self-end flex-shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="sr-only">Enviar</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-cream/40 text-xs py-1">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Identifique-se na entrada para enviar uma homenagem.</span>
          </div>
        )}
      </div>
    </div>
  );
}
