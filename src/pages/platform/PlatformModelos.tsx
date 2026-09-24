import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlatformLayout } from '@/components/PlatformLayout';
import { usePlatformModelos, ModeloGlobal } from '@/hooks/usePlatform';
import { MessageSquareHeart, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

// Global homenagem templates (empresa_id NULL): every funerária sees them, read-only.
const PlatformModelos = () => {
  const { data: modelos = [], isLoading, create, update, remove } = usePlatformModelos();
  const [editing, setEditing] = useState<ModeloGlobal | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', mensagem: '' });

  const openDialog = (modelo: ModeloGlobal | null) => {
    setEditing(modelo);
    setForm(modelo ? { titulo: modelo.titulo, mensagem: modelo.mensagem } : { titulo: '', mensagem: '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.titulo.trim() || !form.mensagem.trim()) return;
    if (editing) await update.mutateAsync({ id: editing.id, data: form });
    else await create.mutateAsync(form);
    setOpen(false);
  };

  return (
    <PlatformLayout activeSection="modelos">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Modelos de homenagem</h1>
          <p className="text-muted-foreground">Modelos globais, disponíveis (somente leitura) para todas as funerárias</p>
        </div>
        <Button variant="gold" onClick={() => openDialog(null)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo modelo
        </Button>
      </header>

      <div className="grid gap-4">
        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Carregando...</p>
        ) : modelos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquareHeart className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum modelo global cadastrado</p>
          </div>
        ) : (
          modelos.map((modelo) => (
            <Card key={modelo.id} className="shadow-soft min-w-0">
              <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{modelo.titulo}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{modelo.mensagem}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openDialog(modelo)} aria-label="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir"
                    className="hover:text-destructive hover:bg-destructive/10"
                    onClick={() => confirm('Excluir este modelo para todas as funerárias?') && remove.mutate(modelo.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Editar modelo' : 'Novo modelo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Título" />
            <Textarea value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} placeholder="Texto da homenagem..." />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button variant="gold" onClick={save} disabled={create.isPending || update.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
};

export default PlatformModelos;
