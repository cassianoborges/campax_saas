import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AdminLayout } from '@/components/AdminLayout';
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { useSalasVelorio } from '@/hooks/useSalasVelorio';
import { useHomenagensTemplates } from '@/hooks/useHomenagensTemplates';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useHomenagens, useDeleteHomenagem } from '@/hooks/useHomenagens';
import { usePresenceMultiple } from '@/hooks/usePresenceMultiple';
import { useVisitantes } from '@/hooks/useVisitantes';
import { exportVisitantesToCSV, downloadCSV } from '@/services/visitantesService';
import { uploadFotoFalecido } from '@/services/storageService';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/datetimeLocal';
import { checkMultipleCameras } from '@/services/cameraStatusService';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Copy,
  FileText,
  Heart,
  Users,
  UserCheck,
  Download,
  CheckCircle2,
  Share2,
  Calendar,
  Camera,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function HomenagensDialog({ velorio_id, velorio_nome }: { velorio_id: string; velorio_nome: string }) {
  const { data: homenagens = [], isLoading } = useHomenagens(velorio_id);
  const { mutate: deleteHomenagem, isPending: isDeleting } = useDeleteHomenagem();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deleteHomenagem(
      { id, velorio_id },
      {
        onSuccess: () => toast({ title: 'Mensagem excluída' }),
        onError: () => toast({ title: 'Erro ao excluir', variant: 'destructive' }),
      }
    );
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          <Heart className="w-4 h-4 text-gold" />
          Homenagens — {velorio_nome}
        </DialogTitle>
      </DialogHeader>
      <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
        {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
        {!isLoading && homenagens.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma homenagem ainda.</p>
        )}
        <div className="space-y-3 py-2">
          {homenagens.map((h) => (
            <div key={h.id} className="flex items-start gap-3 group">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs">{getInitials(h.autor_nome)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{h.autor_nome}</span>
                  {h.parentesco && (
                    <span className="text-xs text-muted-foreground">({h.parentesco})</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(h.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 break-words">{h.mensagem}</p>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  onClick={() => handleDelete(h.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </DialogContent>
  );
}

interface PresencaEntry {
  nome: string;
  celular: string;
  email: string | null;
  primeiro_acesso: string;
  visitas: number;
}

function PresencaDialog({ velorio_id, velorio_nome }: { velorio_id: string; velorio_nome: string }) {
  const { data: visitantesRaw = [], isLoading } = useVisitantes({ velorioId: velorio_id });

  const visitantes: PresencaEntry[] = (() => {
    const map = new Map<string, PresencaEntry>();
    for (const v of visitantesRaw) {
      const key = `${v.nome.trim().toLowerCase()}|${v.celular}`;
      const existing = map.get(key);
      if (existing) {
        existing.visitas += 1;
        if (new Date(v.created_at) < new Date(existing.primeiro_acesso)) {
          existing.primeiro_acesso = v.created_at;
        }
      } else {
        map.set(key, { nome: v.nome, celular: v.celular, email: v.email, primeiro_acesso: v.created_at, visitas: 1 });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.primeiro_acesso).getTime() - new Date(b.primeiro_acesso).getTime()
    );
  })();

  const handleExport = () => {
    const csv = exportVisitantesToCSV(visitantesRaw);
    downloadCSV(csv, `presenca-${velorio_nome.replace(/\s+/g, '_').toLowerCase()}.csv`);
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-gold" />
          Livro de Presença — {velorio_nome}
        </DialogTitle>
      </DialogHeader>
      <div className="flex items-center justify-between -mt-2">
        <p className="text-xs text-muted-foreground">
          {visitantes.length} {visitantes.length === 1 ? 'presença registrada' : 'presenças registradas'}
        </p>
        {visitantesRaw.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
        {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
        {!isLoading && visitantes.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Ninguém se identificou para assistir ainda.</p>
        )}
        <div className="space-y-3 py-2">
          {visitantes.map((v, i) => (
            <div key={i} className="flex items-start gap-3">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs">{getInitials(v.nome)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{v.nome}</span>
                  {v.visitas > 1 && (
                    <span className="text-xs text-muted-foreground">({v.visitas}x)</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(v.primeiro_acesso).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {v.celular}
                  {v.email ? ` • ${v.email}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </DialogContent>
  );
}

interface VelorioFormData {
  nome_falecido: string;
  data_inicio: string;
  data_fim: string;
  sala_velorio_id: string;
  responsavel_velorio_nome: string;
  contato_whatsapp_responsavel: string;
  data_nascimento: string;
  data_falecimento: string;
  mensagem_homenagem: string;
  data_sepultamento: string;
  local_sepultamento: string;
  google_maps_url_sepultamento: string;
}

const VelorioManagement = () => {
  const { toast } = useToast();
  const { isOperador, isAdmin } = useAuth();
  const { velorios, isLoading: veloriosLoading, createVelorio, updateVelorio, deleteVelorio } = useVelorios();
  const { salas, isLoading: salasLoading } = useSalasVelorio();
  const { templates: homenagensTemplates } = useHomenagensTemplates();

  const nonEndedIds = velorios
    .filter(v => getVelorioStatus(v) !== 'Encerrado')
    .map(v => v.id);
  const presenceMap = usePresenceMultiple(nonEndedIds);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<'form' | 'success'>('form');
  const [editingVelorioId, setEditingVelorioId] = useState<string | null>(null);
  const [homenagensTarget, setHomenagensTarget] = useState<{ id: string; nome: string } | null>(null);
  const [presencaTarget, setPresencaTarget] = useState<{ id: string; nome: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ nome: string; token: string } | null>(null);
  const [createdVelorioName, setCreatedVelorioName] = useState('');
  const [formData, setFormData] = useState<VelorioFormData>({
    nome_falecido: '',
    data_inicio: '',
    data_fim: '',
    sala_velorio_id: '',
    responsavel_velorio_nome: '',
    contato_whatsapp_responsavel: '',
    data_nascimento: '',
    data_falecimento: '',
    mensagem_homenagem: '',
    data_sepultamento: '',
    local_sepultamento: '',
    google_maps_url_sepultamento: '',
  });
  const [generatedToken, setGeneratedToken] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState('');
  const [cameraStatuses, setCameraStatuses] = useState<Map<string, boolean>>(new Map());
  const [isCheckingCameraStatus, setIsCheckingCameraStatus] = useState(false);

  useEffect(() => {
    if (!isDialogOpen || !formData.sala_velorio_id) {
      setCameraStatuses(new Map());
      return;
    }

    const salaCameras = salas.find((s) => s.id === formData.sala_velorio_id)?.sala_velorio_cameras ?? [];
    if (salaCameras.length === 0) {
      setCameraStatuses(new Map());
      return;
    }

    let cancelled = false;
    setIsCheckingCameraStatus(true);
    checkMultipleCameras(salaCameras.map((sc) => sc.camera_id))
      .then((statuses) => {
        if (!cancelled) setCameraStatuses(statuses);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingCameraStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, formData.sala_velorio_id, salas]);

  const openCreateDialog = () => {
    setEditingVelorioId(null);
    setDialogStep('form');
    setFormData({
      nome_falecido: '',
      data_inicio: toDatetimeLocalValue(new Date().toISOString()),
      data_fim: '',
      sala_velorio_id: '',
      responsavel_velorio_nome: '',
      contato_whatsapp_responsavel: '',
      data_nascimento: '',
      data_falecimento: '',
      mensagem_homenagem: '',
      data_sepultamento: '',
      local_sepultamento: '',
      google_maps_url_sepultamento: '',
    });
    setGeneratedToken('');
    setFotoFile(null);
    setFotoPreviewUrl('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (velorio: any) => {
    setDialogStep('form');
    setEditingVelorioId(velorio.id);
    setFormData({
      nome_falecido: velorio.nome_falecido,
      data_inicio: toDatetimeLocalValue(velorio.data_inicio),
      data_fim: toDatetimeLocalValue(velorio.data_fim),
      sala_velorio_id: velorio.sala_velorio_id,
      responsavel_velorio_nome: velorio.responsavel_velorio_nome ?? '',
      contato_whatsapp_responsavel: velorio.contato_whatsapp_responsavel ?? '',
      // <input type="date"> needs "YYYY-MM-DD"; the API sends a full ISO timestamp.
      data_nascimento: velorio.data_nascimento?.slice(0, 10) ?? '',
      data_falecimento: velorio.data_falecimento?.slice(0, 10) ?? '',
      mensagem_homenagem: velorio.mensagem_homenagem ?? '',
      data_sepultamento: velorio.data_sepultamento
        ? toDatetimeLocalValue(velorio.data_sepultamento)
        : '',
      local_sepultamento: velorio.local_sepultamento ?? '',
      google_maps_url_sepultamento: velorio.google_maps_url_sepultamento ?? '',
    });
    setGeneratedToken(velorio.token_acesso);
    setFotoFile(null);
    setFotoPreviewUrl(velorio.foto_falecido ?? '');
    setIsDialogOpen(true);
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveFoto = () => {
    setFotoFile(null);
    setFotoPreviewUrl('');
  };

  const saveFotoIfPending = async (velorioId: string): Promise<boolean> => {
    if (!fotoFile) return true;
    try {
      const fotoUrl = await uploadFotoFalecido(velorioId, fotoFile);
      await updateVelorio.mutateAsync({ id: velorioId, data: { foto_falecido: fotoUrl } });
      return true;
    } catch (error) {
      toast({
        title: "Velório salvo, mas a foto não pôde ser enviada",
        description: error instanceof Error ? error.message : "Tente enviar a foto novamente ao editar o velório.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSave = async () => {
    if (!formData.nome_falecido || !formData.data_inicio || !formData.data_fim || !formData.sala_velorio_id) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const dataInicio = new Date(formData.data_inicio);
    const dataFim = new Date(formData.data_fim);
    if (dataFim <= dataInicio) {
      toast({ title: "Datas inválidas", description: "A data/hora de término deve ser posterior à de início.", variant: "destructive" });
      return;
    }

    const velorioData = {
      nome_falecido: formData.nome_falecido,
      data_inicio: fromDatetimeLocalValue(formData.data_inicio),
      data_fim: fromDatetimeLocalValue(formData.data_fim),
      sala_velorio_id: formData.sala_velorio_id,
      responsavel_velorio_nome: formData.responsavel_velorio_nome || undefined,
      contato_whatsapp_responsavel: formData.contato_whatsapp_responsavel || undefined,
      data_nascimento: formData.data_nascimento || undefined,
      data_falecimento: formData.data_falecimento || undefined,
      mensagem_homenagem: formData.mensagem_homenagem || undefined,
      data_sepultamento: formData.data_sepultamento
        ? fromDatetimeLocalValue(formData.data_sepultamento)
        : undefined,
      local_sepultamento: formData.local_sepultamento || undefined,
      google_maps_url_sepultamento: formData.google_maps_url_sepultamento || undefined,
    };

    if (editingVelorioId) {
      try {
        await updateVelorio.mutateAsync({ id: editingVelorioId, data: velorioData });
      } catch {
        return; // the hook's onError already shows the toast
      }
      await saveFotoIfPending(editingVelorioId);
      setIsDialogOpen(false);
    } else {
      let result;
      try {
        result = await createVelorio.mutateAsync(velorioData);
      } catch {
        return; // the hook's onError already shows the toast
      }
      if (result) {
        const fotoOk = await saveFotoIfPending(result.id);
        if (fotoOk) {
          toast({ title: "Velório criado", description: "Novo velório adicionado com sucesso." });
        }
        setGeneratedToken(result.token_acesso);
        setCreatedVelorioName(formData.nome_falecido);
        setDialogStep('success');
      } else {
        setIsDialogOpen(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este velório?')) {
      await deleteVelorio.mutateAsync(id).catch(() => {}); // the hook's onError already shows the toast
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({ title: 'Token copiado!' });
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/?token=${token}`);
    toast({ title: 'Link copiado!' });
  };

  const shareWhatsApp = (nome: string, token: string) => {
    const link = `${window.location.origin}/?token=${token}`;
    const text = `Acesse o velório de *${nome}* pelo link:\n${link}\n\nToken de acesso: *${token}*`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <AdminLayout activeSection="velorios">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Velórios</h1>
          <p className="text-muted-foreground">Gerencie os velórios e transmissões</p>
        </div>
        {isOperador && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Velório
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {dialogStep === 'success' ? 'Velório criado com sucesso!' : editingVelorioId ? 'Editar Velório' : 'Novo Velório'}
                </DialogTitle>
              </DialogHeader>

              {dialogStep === 'success' ? (
                <div className="py-4 space-y-5">
                  <div className="flex flex-col items-center gap-2 pb-2">
                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                    <p className="text-center text-muted-foreground text-sm">
                      O velório foi criado. Compartilhe o token ou o link com a família.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Nome do Falecido</label>
                    <p className="font-heading text-lg text-foreground">{createdVelorioName}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Token de Acesso</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono tracking-[0.3em] text-xl text-center bg-secondary rounded-lg py-3 px-4 text-gold font-bold">
                        {generatedToken}
                      </div>
                      <Button variant="outline" size="icon" onClick={() => copyToken(generatedToken)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Link de Acesso</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-sm bg-secondary rounded-lg py-2.5 px-3 text-muted-foreground truncate">
                        {`${window.location.origin}/?token=${generatedToken}`}
                      </div>
                      <Button variant="outline" size="icon" onClick={() => copyLink(generatedToken)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white"
                      onClick={() => shareWhatsApp(createdVelorioName, generatedToken)}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Compartilhar no WhatsApp
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => setIsDialogOpen(false)}>
                      Fechar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Nome do Falecido *</label>
                      <Input
                        value={formData.nome_falecido}
                        onChange={(e) => setFormData({ ...formData, nome_falecido: e.target.value })}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data/Hora Início *</label>
                        <Input
                          type="datetime-local"
                          value={formData.data_inicio}
                          onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data/Hora Fim *</label>
                        <Input
                          type="datetime-local"
                          value={formData.data_fim}
                          onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Sala do Velório *</label>
                      <Select
                        value={formData.sala_velorio_id}
                        onValueChange={(value) => setFormData({ ...formData, sala_velorio_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={salasLoading ? 'Carregando salas...' : 'Selecione a sala'} />
                        </SelectTrigger>
                        <SelectContent>
                          {salas.map((sala) => (
                            <SelectItem key={sala.id} value={sala.id}>
                              {sala.nome_sala_velorio}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Responsável pelo Velório</label>
                      <Input
                        value={formData.responsavel_velorio_nome}
                        onChange={(e) => setFormData({ ...formData, responsavel_velorio_nome: e.target.value })}
                        placeholder="Nome do parente responsável"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">WhatsApp do Responsável</label>
                      <Input
                        value={formData.contato_whatsapp_responsavel}
                        onChange={(e) => setFormData({ ...formData, contato_whatsapp_responsavel: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>

                    <h3 className="text-sm font-medium text-foreground pt-2 border-t border-border">Sobre o falecido</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data de Nascimento</label>
                        <Input
                          type="date"
                          value={formData.data_nascimento}
                          onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data de Falecimento</label>
                        <Input
                          type="date"
                          value={formData.data_falecimento}
                          onChange={(e) => setFormData({ ...formData, data_falecimento: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Foto</label>
                      <div className="flex items-center gap-3">
                        {fotoPreviewUrl && (
                          <img
                            src={fotoPreviewUrl}
                            alt="Prévia da foto"
                            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 flex items-center gap-2">
                          <Input type="file" accept="image/*" onChange={handleFotoChange} className="flex-1" />
                          {fotoPreviewUrl && (
                            <Button type="button" variant="ghost" size="icon" onClick={handleRemoveFoto} title="Remover">
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">
                        Escolher do banco de homenagens
                      </label>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value === '__nova__') {
                            window.open('/admin/configuracoes/homenagens', '_blank');
                            return;
                          }
                          const template = homenagensTemplates.find((t) => t.id === value);
                          if (template) {
                            setFormData({ ...formData, mensagem_homenagem: template.mensagem });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar uma mensagem pronta (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {homenagensTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>
                          ))}
                          <SelectItem value="__nova__">+ Adicionar nova mensagem</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Mensagem de Homenagem</label>
                      <Textarea
                        value={formData.mensagem_homenagem}
                        onChange={(e) => setFormData({ ...formData, mensagem_homenagem: e.target.value })}
                        placeholder="Um trecho especial sobre a vida do(a) falecido(a)..."
                      />
                    </div>

                    <h3 className="text-sm font-medium text-foreground pt-2 border-t border-border">Sepultamento</h3>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Data e Hora de Sepultamento</label>
                      <Input
                        type="datetime-local"
                        value={formData.data_sepultamento}
                        onChange={(e) => setFormData({ ...formData, data_sepultamento: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Local/Cemitério</label>
                      <Input
                        value={formData.local_sepultamento}
                        onChange={(e) => setFormData({ ...formData, local_sepultamento: e.target.value })}
                        placeholder="Nome do cemitério"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Link do Google Maps (Cemitério)</label>
                      <Input
                        value={formData.google_maps_url_sepultamento}
                        onChange={(e) => setFormData({ ...formData, google_maps_url_sepultamento: e.target.value })}
                        placeholder="https://maps.google.com/..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Token de Acesso</label>
                      <Input
                        value={generatedToken || (editingVelorioId ? 'Token existente' : 'Será gerado ao salvar')}
                        disabled
                        className="font-mono tracking-wider text-center bg-secondary"
                      />
                      {generatedToken && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Token: <span className="font-mono font-bold text-gold">{generatedToken}</span>
                        </p>
                      )}
                    </div>
                    {formData.sala_velorio_id && (() => {
                      const salaCameras = salas.find((s) => s.id === formData.sala_velorio_id)?.sala_velorio_cameras ?? [];
                      const offlineCameras = salaCameras.filter((sc) => cameraStatuses.get(sc.camera_id) === false);
                      return (
                        <div>
                          <label className="block text-sm text-muted-foreground mb-3">Câmeras da Sala</label>
                          <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-secondary/50 rounded-lg">
                            {salaCameras.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Esta sala ainda não tem câmeras. Configure em "Salas".</p>
                            ) : (
                              salaCameras.map((sc) => {
                                const online = cameraStatuses.get(sc.camera_id);
                                return (
                                  <div key={sc.camera_id} className="flex items-center gap-2 text-sm text-foreground">
                                    <Camera className="w-3.5 h-3.5 text-gold" />
                                    {sc.cameras.nome}
                                    <span className={`ml-auto w-2 h-2 rounded-full ${
                                      isCheckingCameraStatus
                                        ? 'bg-gray-400 animate-pulse'
                                        : online === true
                                          ? 'bg-green-500'
                                          : online === false
                                            ? 'bg-red-500'
                                            : 'bg-gray-400'
                                    }`} />
                                  </div>
                                );
                              })
                            )}
                          </div>
                          {!isCheckingCameraStatus && offlineCameras.length > 0 && (
                            <Alert className="mt-3 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertTitle>Sala de Velório: existem câmeras Offline</AlertTitle>
                              <AlertDescription>
                                {offlineCameras.map((sc) => sc.cameras.nome).join(', ')} {offlineCameras.length === 1 ? 'está offline' : 'estão offline'} no momento.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      );
                    })()}
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
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="grid gap-4">
        {veloriosLoading || salasLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando velórios...</p>
          </div>
        ) : velorios.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum velório cadastrado</p>
          </div>
        ) : (
          velorios.map((velorio) => {
            const status = getVelorioStatus(velorio);
            const cameraCount = velorio.sala?.sala_velorio_cameras?.length || 0;
            const presence = presenceMap.get(velorio.id);
            const onlineCount = presence?.count ?? 0;
            const onlineUsers = presence?.users.filter(u => u.nome) ?? [];
            return (
              <Card key={velorio.id} className="shadow-soft hover:shadow-elegant transition-shadow min-w-0">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-heading text-lg text-foreground">{velorio.nome_falecido}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          status === 'Ao Vivo'
                            ? 'bg-red-500/10 text-red-500'
                            : status === 'Agendado'
                              ? 'bg-gold/10 text-gold'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {status}
                        </span>
                        {onlineCount > 0 && (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            {onlineCount} online
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{velorio.sala?.nome_sala_velorio}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          {new Date(velorio.data_inicio).toLocaleDateString('pt-BR')}{' '}
                          {new Date(velorio.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {new Date(velorio.data_fim).toLocaleDateString('pt-BR')}{' '}
                          {new Date(velorio.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>•</span>
                        <span>{cameraCount} câmera(s)</span>
                      </div>
                      {onlineUsers.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Users className="w-3 h-3 text-green-500 flex-shrink-0" />
                          {onlineUsers.map((u, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                              <span className="w-1 h-1 rounded-full bg-green-400 inline-block" />
                              {u.nome}
                            </span>
                          ))}
                          {onlineCount > onlineUsers.length && (
                            <span className="text-xs text-muted-foreground">+{onlineCount - onlineUsers.length} sem identificação</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80"
                        onClick={() => copyToken(velorio.token_acesso)}
                      >
                        <span className="font-mono text-sm tracking-wider">{velorio.token_acesso}</span>
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <Button variant="ghost" size="icon" title="Compartilhar" onClick={() => setShareTarget({ nome: velorio.nome_falecido, token: velorio.token_acesso })}>
                        <Share2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Ver Homenagens" onClick={() => setHomenagensTarget({ id: velorio.id, nome: velorio.nome_falecido })}>
                        <Heart className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Livro de Presença" onClick={() => setPresencaTarget({ id: velorio.id, nome: velorio.nome_falecido })}>
                        <UserCheck className="w-4 h-4" />
                      </Button>
                      {isOperador && (
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(velorio)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(velorio.id)} className="hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!homenagensTarget} onOpenChange={(open) => { if (!open) setHomenagensTarget(null); }}>
        {homenagensTarget && (
          <HomenagensDialog velorio_id={homenagensTarget.id} velorio_nome={homenagensTarget.nome} />
        )}
      </Dialog>

      <Dialog open={!!presencaTarget} onOpenChange={(open) => { if (!open) setPresencaTarget(null); }}>
        {presencaTarget && (
          <PresencaDialog velorio_id={presencaTarget.id} velorio_nome={presencaTarget.nome} />
        )}
      </Dialog>

      <Dialog open={!!shareTarget} onOpenChange={(open) => { if (!open) setShareTarget(null); }}>
        {shareTarget && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <Share2 className="w-4 h-4 text-gold" />
                Compartilhar — {shareTarget.nome}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Token de Acesso</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono tracking-[0.3em] text-xl text-center bg-secondary rounded-lg py-3 px-4 text-gold font-bold">
                    {shareTarget.token}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copyToken(shareTarget.token)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Link de Acesso</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-sm bg-secondary rounded-lg py-2.5 px-3 text-muted-foreground truncate">
                    {`${window.location.origin}/?token=${shareTarget.token}`}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copyLink(shareTarget.token)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white"
                onClick={() => shareWhatsApp(shareTarget.nome, shareTarget.token)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Compartilhar no WhatsApp
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AdminLayout>
  );
};

export default VelorioManagement;
