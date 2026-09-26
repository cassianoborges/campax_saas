import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiClient, setToken } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

const MIN_LENGTH = 8;
const VAZIO = { atual: '', nova: '', confirmacao: '' };

function Campo({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-muted-foreground mb-2">{label}</span>
      <Input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
    </label>
  );
}

/** "Alterar senha" button for the sidebar (admin panel and /platform) plus its dialog. */
export function AlterarSenhaDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudarAberto = (aberto: boolean) => {
    setOpen(aberto);
    if (!aberto) {
      setForm(VAZIO);
      setErro(null);
    }
  };

  const validar = () => {
    if (form.nova.length < MIN_LENGTH) return `A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres`;
    if (form.nova !== form.confirmacao) return 'A confirmação não confere com a nova senha';
    if (form.nova === form.atual) return 'A nova senha precisa ser diferente da atual';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalido = validar();
    if (invalido) return setErro(invalido);
    setSalvando(true);
    setErro(null);
    try {
      const { token } = await apiClient.post<{ token: string }>('/auth/senha', { senha_atual: form.atual, nova_senha: form.nova });
      // The old token stopped working on the server; keep this session with the new one.
      setToken(token);
      mudarAberto(false);
      toast({ title: 'Senha alterada', description: 'Os outros acessos abertos com a senha antiga foram encerrados.' });
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível alterar a senha');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start text-cream/50 hover:bg-gold/10 hover:text-gold">
          <KeyRound className="w-4 h-4 mr-3" />
          Alterar senha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Ao salvar, os outros acessos abertos com a senha antiga são encerrados.</DialogDescription>
          </DialogHeader>
          <Campo label="Senha atual" value={form.atual} onChange={(atual) => setForm({ ...form, atual })} autoComplete="current-password" />
          <Campo label={`Nova senha (mínimo ${MIN_LENGTH} caracteres)`} value={form.nova} onChange={(nova) => setForm({ ...form, nova })} autoComplete="new-password" />
          <Campo label="Confirme a nova senha" value={form.confirmacao} onChange={(confirmacao) => setForm({ ...form, confirmacao })} autoComplete="new-password" />
          {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => mudarAberto(false)}>Cancelar</Button>
            <Button type="submit" variant="gold" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
