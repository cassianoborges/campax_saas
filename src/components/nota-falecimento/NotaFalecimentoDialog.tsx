import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Copy, Download, ImageUp, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useVelorios, Velorio } from '@/hooks/useVelorios';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/datetimeLocal';
import { BASE_DOMAIN } from '@/lib/hostEmpresa';
import { ALTURA_NOTA, baixar, compartilhar, copiar, gerarPng, LARGURA_NOTA, paraDataUrl, podeCompartilhar, podeCopiar } from '@/lib/imagemNota';
import { FAMILIARES_MAX, montarNota, NotaFalecimentoDados, nomeArquivoNota } from '@/lib/notaFalecimento';
import { uploadFotoFalecido } from '@/services/storageService';
import { MODELOS_NOTA, modeloPorId, ModeloNotaId } from './modelos';

const CHAVE_MODELO = 'campax_nota_modelo';
const ESCALA_PREVIA = 0.3;

function modeloSalvo(): ModeloNotaId {
  try {
    return modeloPorId(localStorage.getItem(CHAVE_MODELO)).id;
  } catch {
    return 'classico';
  }
}

function salvarModelo(id: ModeloNotaId) {
  try {
    localStorage.setItem(CHAVE_MODELO, id);
  } catch {
    // no storage (private window): the choice just isn't remembered
  }
}

interface Formulario {
  nome_falecido: string;
  data_nascimento: string;
  data_falecimento: string;
  data_inicio: string;
  data_fim: string;
  data_sepultamento: string;
  local_sepultamento: string;
  familiares: string;
}

function formularioDe(v: Velorio): Formulario {
  return {
    nome_falecido: v.nome_falecido,
    data_nascimento: v.data_nascimento?.slice(0, 10) ?? '',
    data_falecimento: v.data_falecimento?.slice(0, 10) ?? '',
    data_inicio: toDatetimeLocalValue(v.data_inicio),
    data_fim: toDatetimeLocalValue(v.data_fim),
    data_sepultamento: v.data_sepultamento ? toDatetimeLocalValue(v.data_sepultamento) : '',
    local_sepultamento: v.local_sepultamento ?? '',
    familiares: v.familiares ?? '',
  };
}

interface Props {
  velorio: Velorio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotaFalecimentoDialog({ velorio, open, onOpenChange }: Props) {
  const { empresa } = useAuth();
  const { toast } = useToast();
  const { updateVelorio } = useVelorios();
  const [form, setForm] = useState<Formulario>(() => formularioDe(velorio));
  const [modeloId, setModeloId] = useState<ModeloNotaId>(modeloSalvo);
  const [incluirTransmissao, setIncluirTransmissao] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dadosExport, setDadosExport] = useState<NotaFalecimentoDados | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Each open starts from the velório as it is now.
  useEffect(() => {
    if (!open) return;
    setForm(formularioDe(velorio));
    setIncluirTransmissao(false);
    setFotoFile(null);
    setFotoPreviewUrl(null);
    setArquivo(null);
  }, [open, velorio]);

  useEffect(() => () => { if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl); }, [fotoPreviewUrl]);

  const datasValidas = !!form.data_inicio && !!form.data_fim && new Date(form.data_fim) > new Date(form.data_inicio);
  const familiaresLongo = form.familiares.trim().length > FAMILIARES_MAX;
  const podeGerar = !!empresa && !!form.nome_falecido.trim() && datasValidas && !familiaresLongo && !gerando;

  const dados = useMemo(() => {
    if (!empresa || !datasValidas) return null;
    return montarNota(
      {
        ...form,
        data_inicio: fromDatetimeLocalValue(form.data_inicio),
        data_fim: fromDatetimeLocalValue(form.data_fim),
        data_sepultamento: form.data_sepultamento ? fromDatetimeLocalValue(form.data_sepultamento) : null,
        foto_falecido: fotoPreviewUrl ?? velorio.foto_falecido,
        token_acesso: velorio.token_acesso,
        sala: velorio.sala,
      },
      empresa,
      { incluirTransmissao, baseDomain: BASE_DOMAIN, hostAtual: window.location.host },
    );
  }, [form, fotoPreviewUrl, velorio, empresa, incluirTransmissao, datasValidas]);

  const Modelo = modeloPorId(modeloId).componente;
  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
    setArquivo(null);
  };

  const escolherModelo = (id: ModeloNotaId) => {
    setModeloId(id);
    salvarModelo(id);
    setArquivo(null);
  };

  const escolherFoto = (file: File | undefined) => {
    if (!file) return;
    setFotoFile(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
    setArquivo(null);
  };

  const salvarEGerar = async () => {
    if (!podeGerar || !dados) return;
    setGerando(true);
    try {
      try {
        await updateVelorio.mutateAsync({
          id: velorio.id,
          data: {
            nome_falecido: form.nome_falecido.trim(),
            data_nascimento: form.data_nascimento,
            data_falecimento: form.data_falecimento,
            data_inicio: fromDatetimeLocalValue(form.data_inicio),
            data_fim: fromDatetimeLocalValue(form.data_fim),
            data_sepultamento: form.data_sepultamento ? fromDatetimeLocalValue(form.data_sepultamento) : null,
            local_sepultamento: form.local_sepultamento.trim() || null,
            familiares: form.familiares.trim() || null,
          },
        });
      } catch {
        return; // the hook's onError already shows the toast
      }

      // A new photo that fails to upload keeps the velório's current one (if any) in the notice.
      let fotoUrl = velorio.foto_falecido ?? null;
      if (fotoFile) {
        try {
          fotoUrl = await uploadFotoFalecido(velorio.id, fotoFile);
          setFotoFile(null);
        } catch (error) {
          toast({ title: 'A foto não pôde ser enviada', description: (error as Error).message, variant: 'destructive' });
        }
      }

      // Images are inlined so the canvas isn't tainted; one that can't be read is left out.
      const [foto, logo] = await Promise.all([paraDataUrl(fotoUrl), paraDataUrl(dados.empresa.logoUrl)]);
      if ((fotoUrl && !foto) || (dados.empresa.logoUrl && !logo)) {
        toast({ title: 'Uma imagem não pôde ser carregada', description: 'A nota foi gerada sem ela.' });
      }
      const paraExportar = { ...dados, fotoUrl: foto, empresa: { ...dados.empresa, logoUrl: logo } };
      flushSync(() => setDadosExport(paraExportar));
      const blob = await gerarPng(exportRef.current!.firstElementChild as HTMLElement);
      setArquivo(new File([blob], nomeArquivoNota(form.nome_falecido), { type: 'image/png' }));
    } catch {
      toast({ title: 'Não foi possível gerar a imagem', variant: 'destructive' });
    } finally {
      setGerando(false);
    }
  };

  const acaoSegura = (acao: () => Promise<void> | void, erro: string) => async () => {
    try {
      await acao();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast({ title: erro, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nota de falecimento</DialogTitle>
          <DialogDescription>Confira os dados, escolha o modelo e gere a imagem para compartilhar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="order-2 md:order-1 grid gap-4">
            <div className="flex gap-2 flex-wrap">
              {MODELOS_NOTA.map((m) => (
                <Button key={m.id} type="button" size="sm" variant={m.id === modeloId ? 'gold' : 'outline'} onClick={() => escolherModelo(m.id)}>
                  {m.nome}
                </Button>
              ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-nome">Nome do falecido *</Label>
              <Input id="nota-nome" value={form.nome_falecido} onChange={set('nome_falecido')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-foto">Foto</Label>
              <Input id="nota-foto" type="file" accept="image/*" onChange={(e) => escolherFoto(e.target.files?.[0])} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-nasc">Nascimento</Label><Input id="nota-nasc" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-falec">Falecimento</Label><Input id="nota-falec" type="date" value={form.data_falecimento} onChange={set('data_falecimento')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-ini">Velório: início *</Label><Input id="nota-ini" type="datetime-local" value={form.data_inicio} onChange={set('data_inicio')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-fim">Velório: fim *</Label><Input id="nota-fim" type="datetime-local" value={form.data_fim} onChange={set('data_fim')} /></div>
            </div>
            {!datasValidas && <p className="text-sm text-destructive">O fim do velório precisa ser depois do início.</p>}
            <p className="text-sm text-muted-foreground">Sala: {velorio.sala?.nome_sala_velorio ?? '—'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-sep">Sepultamento</Label><Input id="nota-sep" type="datetime-local" value={form.data_sepultamento} onChange={set('data_sepultamento')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-local">Local do sepultamento</Label><Input id="nota-local" value={form.local_sepultamento} onChange={set('local_sepultamento')} /></div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-fam">Familiares</Label>
              <Textarea id="nota-fam" rows={4} value={form.familiares} onChange={set('familiares')} placeholder="Deixa a esposa Maria, os filhos João e Ana…" />
              <span className={`text-xs text-right ${familiaresLongo ? 'text-destructive' : 'text-muted-foreground'}`}>
                {form.familiares.trim().length}/{FAMILIARES_MAX}
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={incluirTransmissao} onCheckedChange={(v) => { setIncluirTransmissao(v === true); setArquivo(null); }} />
              Incluir transmissão ao vivo (endereço e código de acesso)
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="gold" disabled={!podeGerar} onClick={salvarEGerar}>
                {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageUp className="w-4 h-4 mr-2" />}
                Salvar e gerar
              </Button>
              {arquivo && podeCompartilhar(arquivo) && (
                <Button variant="outline" onClick={acaoSegura(() => compartilhar(arquivo, `Nota de falecimento — ${form.nome_falecido}`), 'Não foi possível compartilhar')}>
                  <Share2 className="w-4 h-4 mr-2" /> Compartilhar
                </Button>
              )}
              {arquivo && (
                <Button variant="outline" onClick={acaoSegura(() => baixar(arquivo, arquivo.name), 'Não foi possível baixar')}>
                  <Download className="w-4 h-4 mr-2" /> Baixar PNG
                </Button>
              )}
              {arquivo && podeCopiar() && (
                <Button variant="ghost" onClick={acaoSegura(async () => { await copiar(arquivo); toast({ title: 'Imagem copiada' }); }, 'Não foi possível copiar')}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar imagem
                </Button>
              )}
            </div>
          </div>

          <div className="order-1 md:order-2 mx-auto" style={{ width: LARGURA_NOTA * ESCALA_PREVIA, height: ALTURA_NOTA * ESCALA_PREVIA }}>
            {dados && (
              <div style={{ transform: `scale(${ESCALA_PREVIA})`, transformOrigin: 'top left', boxShadow: '0 4px 24px rgba(0,0,0,.25)' }}>
                <Modelo dados={dados} />
              </div>
            )}
          </div>
        </div>

        {/* Full-size copy used only for the export: off screen, with images already inlined. The wrapper
            carries the positioning so the exported node itself has none. */}
        <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          {dadosExport && <Modelo dados={dadosExport} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
