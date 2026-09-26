import { apiClient } from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { AdminLayout } from '@/components/AdminLayout';
import { useCameras, Camera as CameraType } from '@/hooks/useCameras';
import { useAuth } from '@/hooks/useAuth';
import {
  Camera,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  RefreshCw,
  Link,
  Play,
  Radio
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { checkMultipleCameras } from '@/services/cameraStatusService';

const CameraManagement = () => {
  const { cameras, isLoading, createCamera, updateCamera, deleteCamera } = useCameras();
  const queryClient = useQueryClient();
  const { isOperador, isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);
  const [formData, setFormData] = useState({ nome: '', rtsp_url: '', ativo: true });
  const [cameraStatuses, setCameraStatuses] = useState<Map<string, boolean>>(new Map());
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [playerCamera, setPlayerCamera] = useState<CameraType | null>(null);
  // MediaMTX only plays with a token: the preview asks the backend for a short-lived reader URL.
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  useEffect(() => {
    setPlayerUrl(null);
    if (!playerCamera) return;
    let cancelled = false;
    apiClient
      .post<{ url: string }>(`/cameras/${playerCamera.id}/stream-url`)
      .then(({ url }) => !cancelled && setPlayerUrl(url))
      .catch(() => !cancelled && setPlayerUrl(null));
    return () => {
      cancelled = true;
    };
  }, [playerCamera]);

  const openCreateDialog = () => {
    setEditingCamera(null);
    setFormData({ nome: '', rtsp_url: '', ativo: true });
    setIsDialogOpen(true);
  };

  const openEditDialog = (camera: CameraType) => {
    setEditingCamera(camera);
    setFormData({ nome: camera.nome, rtsp_url: camera.rtsp_url, ativo: camera.ativo });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.rtsp_url) return;

    try {
      if (editingCamera) {
        await updateCamera.mutateAsync({ id: editingCamera.id, data: formData });
      } else {
        await createCamera.mutateAsync(formData);
      }
    } catch {
      return; // the hook's onError already shows the toast
    }

    setIsDialogOpen(false);
    setFormData({ nome: '', rtsp_url: '', ativo: true });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta câmera?')) {
      await deleteCamera.mutateAsync(id).catch(() => {}); // the hook's onError already shows the toast
    }
  };

  const checkAllCamerasStatus = async () => {
    if (cameras.length === 0) return;
    setIsCheckingStatus(true);
    try {
      // The backend tests the cameras and stores the result; refetch to get status_checked_at.
      const statuses = await checkMultipleCameras(cameras.map((c) => c.id));
      setCameraStatuses(statuses);
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
    } catch (error) {
      console.error('Error checking camera statuses:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (cameras.length > 0 && !isLoading) {
      checkAllCamerasStatus();
    }
  }, [cameras.length, isLoading]);

  return (
    <AdminLayout activeSection="cameras">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Câmeras</h1>
          <p className="text-muted-foreground">Gerencie as câmeras de transmissão</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={checkAllCamerasStatus}
            disabled={isCheckingStatus || cameras.length === 0}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            {isCheckingStatus ? 'Verificando...' : 'Atualizar Status'}
          </Button>
          {isOperador && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gold" onClick={openCreateDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Câmera
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {editingCamera ? 'Editar Câmera' : 'Nova Câmera'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Nome da Câmera</label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Sala Principal - Câmera 1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">URL RTSP</label>
                    <Input
                      value={formData.rtsp_url}
                      onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
                      placeholder="rtsp://usuario:senha@ip:porta/stream"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Câmera ativa</p>
                      <p className="text-xs text-muted-foreground">
                        {formData.ativo ? 'Câmera habilitada para uso' : 'Câmera desabilitada'}
                      </p>
                    </div>
                    <Switch
                      checked={formData.ativo}
                      onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                    />
                  </div>
                  {editingCamera?.webrtc_url && (
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Link className="w-3.5 h-3.5" />
                        URL WebRTC
                      </label>
                      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2">
                        <p className="text-sm font-mono text-muted-foreground truncate flex-1">
                          {editingCamera.webrtc_url}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gerado automaticamente pelo serviço de sincronização
                      </p>
                    </div>
                  )}
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
        </div>
      </header>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando câmeras...</p>
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Camera className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma câmera cadastrada</p>
          </div>
        ) : (
          cameras.map((camera) => (
            <Card key={camera.id} className="shadow-soft hover:shadow-elegant transition-shadow min-w-0">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center relative">
                    <Camera className="w-5 h-5 text-gold" />
                    <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-card ${
                      cameraStatuses.get(camera.id) === true
                        ? 'bg-green-500'
                        : cameraStatuses.get(camera.id) === false
                          ? 'bg-red-500'
                          : 'bg-gray-400 animate-pulse'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{camera.nome}</h3>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-muted-foreground font-mono truncate max-w-md">
                        {camera.rtsp_url}
                      </p>
                      {!isCheckingStatus && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          cameraStatuses.get(camera.id) === true
                            ? 'bg-green-500/10 text-green-500'
                            : cameraStatuses.get(camera.id) === false
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {cameraStatuses.get(camera.id) === true
                            ? 'Online'
                            : cameraStatuses.get(camera.id) === false
                              ? 'Offline'
                              : 'Desconhecido'}
                        </span>
                      )}
                      {!isCheckingStatus && camera.status_checked_at && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          verificado às {new Date(camera.status_checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {camera.webrtc_url ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPlayerCamera(camera)}
                      className="hover:text-green-500 hover:bg-green-500/10"
                      title="Ver câmera"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" disabled className="opacity-30" title="URL WebRTC não disponível">
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  {isOperador && (
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(camera)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(camera.id)}
                      className="hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!playerCamera} onOpenChange={(open) => { if (!open) setPlayerCamera(null); }}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="font-heading flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-400 animate-pulse" />
              {playerCamera?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-black aspect-video w-full">
            {playerUrl && (
              <iframe
                src={playerUrl}
                className="w-full h-full border-0"
                allow="autoplay; camera; microphone"
                title={playerCamera.nome}
              />
            )}
          </div>
          <div className="px-6 py-3 flex items-center justify-between border-t border-border">
            <p className="text-xs text-muted-foreground font-mono truncate max-w-sm">
              {playerCamera?.webrtc_url}
            </p>
            <Button variant="outline" size="sm" onClick={() => setPlayerCamera(null)}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default CameraManagement;
