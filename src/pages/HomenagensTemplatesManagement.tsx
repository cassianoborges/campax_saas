import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { AdminLayout } from '@/components/AdminLayout';
import { useHomenagensTemplates, HomenagemTemplate } from '@/hooks/useHomenagensTemplates';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquareHeart, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const HomenagensTemplatesManagement = () => {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useHomenagensTemplates();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HomenagemTemplate | null>(null);
  const [formData, setFormData] = useState({ titulo: '', mensagem: '' });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData({ titulo: '', mensagem: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: HomenagemTemplate) => {
    setEditingTemplate(template);
    setFormData({ titulo: template.titulo, mensagem: template.mensagem });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.mensagem) return;

    if (editingTemplate) {
      await updateTemplate.mutateAsync({ id: editingTemplate.id, data: formData });
    } else {
      await createTemplate.mutateAsync(formData);
    }

    setIsDialogOpen(false);
    setFormData({ titulo: '', mensagem: '' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta mensagem?')) {
      await deleteTemplate.mutateAsync(id);
    }
  };

  return (
    <AdminLayout activeSection="configuracoes">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Banco de Homenagens</h1>
          <p className="text-muted-foreground">Mensagens de homenagem reutilizáveis no cadastro de velório</p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Mensagem
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingTemplate ? 'Editar Mensagem' : 'Nova Mensagem'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Título</label>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ex: Mensagem para idosos"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Mensagem</label>
                  <Textarea
                    value={formData.mensagem}
                    onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                    placeholder="Texto completo da homenagem..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button variant="gold" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando mensagens...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquareHeart className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma mensagem cadastrada</p>
          </div>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="shadow-soft hover:shadow-elegant transition-shadow min-w-0">
              <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">
                    {template.titulo}
                    {template.empresa_id === null && (
                      <span className="ml-2 align-middle text-[11px] font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Modelo Campax
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.mensagem}</p>
                </div>
                {isAdmin && template.empresa_id !== null && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(template)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                      className="hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
};

export default HomenagensTemplatesManagement;
