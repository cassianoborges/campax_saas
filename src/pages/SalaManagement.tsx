import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminLayout } from '@/components/AdminLayout';
import { useSalasVelorio, SalaVelorio } from '@/hooks/useSalasVelorio';
import { formatWhatsapp } from '@/lib/phoneMask';
import { slugify } from '@/lib/slugify';
import { useCameras } from '@/hooks/useCameras';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Pencil, Trash2, X, Save, MapPin, Camera, Link2, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface SalaFormData {
  nome_sala_velorio: string;
  slug: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavel_sala_velorio: string;
  whatsapp_responsavel_sala_velorio: string;
  google_maps_url: string;
  camera_ids: string[];
}

const emptyForm: SalaFormData = {
  nome_sala_velorio: '',
  slug: '',
  endereco: '',
  bairro: '',
  cep: '',
  cidade: '',
  estado: '',
  responsavel_sala_velorio: '',
  whatsapp_responsavel_sala_velorio: '',
  google_maps_url: '',
  camera_ids: [],
};

const SalaManagement = () => {
  const { toast } = useToast();
  const { isOperador, isAdmin, empresa } = useAuth();
  // Prefix of the fixed public links (/:hashEmpresa/:salaSlug) — the logged-in user's empresa.
  const empresaHash = empresa?.hash_publico ?? '';
  const { salas, isLoading: salasLoading, createSala, updateSala, deleteSala } = useSalasVelorio();
  const { cameras, isLoading: camerasLoading } = useCameras();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalaId, setEditingSalaId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SalaFormData>(emptyForm);
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);

  const openCreateDialog = () => {
    setEditingSalaId(null);
    setFormData(emptyForm);
    setSlugEditadoManualmente(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (sala: SalaVelorio) => {
    setEditingSalaId(sala.id);
    setFormData({
      nome_sala_velorio: sala.nome_sala_velorio,
      slug: sala.slug,
      endereco: sala.endereco ?? '',
      bairro: sala.bairro ?? '',
      cep: sala.cep ?? '',
      cidade: sala.cidade ?? '',
      estado: sala.estado ?? '',
      responsavel_sala_velorio: sala.responsavel_sala_velorio ?? '',
      whatsapp_responsavel_sala_velorio: sala.whatsapp_responsavel_sala_velorio ?? '',
      google_maps_url: sala.google_maps_url ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
    });
    setSlugEditadoManualmente(true);
    setIsDialogOpen(true);
  };

  const handleCameraToggle = (cameraId: string) => {
    setFormData({
      ...formData,
      camera_ids: formData.camera_ids.includes(cameraId)
        ? formData.camera_ids.filter((id) => id !== cameraId)
        : [...formData.camera_ids, cameraId],
    });
  };

  const handleSave = async () => {
    if (!formData.nome_sala_velorio) {
      toast({ title: "Campo obrigatório", description: "Informe o nome da sala.", variant: "destructive" });
      return;
    }

    if (editingSalaId) {
      await updateSala.mutateAsync({ id: editingSalaId, data: formData });
    } else {
      await createSala.mutateAsync(formData);
    }

    setIsDialogOpen(false);
    setFormData(emptyForm);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta sala?')) {
      await deleteSala.mutateAsync(id);
    }
  };

  return (
    <AdminLayout activeSection="salas">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Salas de Velório</h1>
          <p className="text-muted-foreground">Gerencie as salas e as câmeras de cada uma</p>
        </div>
        {isOperador && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Sala
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingSalaId ? 'Editar Sala' : 'Nova Sala'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Nome da Sala *</label>
                  <Input
                    value={formData.nome_sala_velorio}
                    onChange={(e) => {
                      const nome = e.target.value;
                      setFormData({
                        ...formData,
                        nome_sala_velorio: nome,
                        slug: slugEditadoManualmente ? formData.slug : slugify(nome),
                      });
                    }}
                    placeholder="Ex: Sala Ouro"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Link público da sala</label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugEditadoManualmente(true);
                      setFormData({ ...formData, slug: slugify(e.target.value) });
                    }}
                    placeholder="sala_ouro"
                  />
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {window.location.origin}/{empresaHash}/{formData.slug || '...'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Endereço</label>
                  <Input
                    value={formData.endereco}
                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    placeholder="Rua, número"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Bairro</label>
                    <Input
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">CEP</label>
                    <Input
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      placeholder="00000-000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Cidade</label>
                    <Input
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Estado</label>
                    <Input
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Link do Google Maps</label>
                  <Input
                    value={formData.google_maps_url}
                    onChange={(e) => setFormData({ ...formData, google_maps_url: e.target.value })}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Responsável</label>
                    <Input
                      value={formData.responsavel_sala_velorio}
                      onChange={(e) => setFormData({ ...formData, responsavel_sala_velorio: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">WhatsApp do Responsável</label>
                    <Input
                      type="tel"
                      value={formData.whatsapp_responsavel_sala_velorio}
                      onChange={(e) => setFormData({ ...formData, whatsapp_responsavel_sala_velorio: formatWhatsapp(e.target.value) })}
                      placeholder="+55 62 99999-9999"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-3">Câmeras da Sala</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-secondary/50 rounded-lg">
                    {camerasLoading ? (
                      <p className="text-sm text-muted-foreground">Carregando câmeras...</p>
                    ) : cameras.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma câmera cadastrada</p>
                    ) : (
                      cameras.map((camera) => (
                        <div key={camera.id} className="flex items-center gap-3">
                          <Checkbox
                            id={camera.id}
                            checked={formData.camera_ids.includes(camera.id)}
                            onCheckedChange={() => handleCameraToggle(camera.id)}
                          />
                          <label htmlFor={camera.id} className="text-sm text-foreground cursor-pointer flex-1">
                            {camera.nome}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
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
        {salasLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando salas...</p>
          </div>
        ) : salas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma sala cadastrada</p>
          </div>
        ) : (
          salas.map((sala) => {
            const cameraCount = sala.sala_velorio_cameras?.length || 0;
            const enderecoParts = [sala.endereco, sala.bairro, sala.cidade && sala.estado ? `${sala.cidade}/${sala.estado}` : sala.cidade]
              .filter(Boolean)
              .join(' - ');
            return (
              <Card key={sala.id} className="shadow-soft hover:shadow-elegant transition-shadow min-w-0">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground">{sala.nome_sala_velorio}</h3>
                      {enderecoParts && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {enderecoParts}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}
                        {sala.whatsapp_responsavel_sala_velorio && <span>WhatsApp: {sala.whatsapp_responsavel_sala_velorio}</span>}
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3" />
                          {cameraCount} câmera(s)
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 truncate">
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{window.location.origin}/{empresaHash}/{sala.slug}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/${empresaHash}/${sala.slug}`);
                            toast({ title: "Link copiado" });
                          }}
                          className="text-gold hover:underline flex-shrink-0 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOperador && (
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(sala)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(sala.id)}
                        className="hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AdminLayout>
  );
};

export default SalaManagement;
