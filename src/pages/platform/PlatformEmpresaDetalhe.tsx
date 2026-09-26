import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlatformLayout, StatusBadge } from '@/components/PlatformLayout';
import { EmpresaLogo } from '@/components/EmpresaLogo';
import { EmpresaEnderecoFields } from '@/components/EmpresaEnderecoFields';
import { enderecoForm, enderecoParaApi } from '@/lib/empresaEndereco';
import { usePlatformEmpresa, usePlatformUsuarios, EmpresaPlataforma } from '@/hooks/usePlatform';
import { useBranding } from '@/hooks/useBranding';
import { contrastRatio } from '@/lib/branding';
import { TenantRole } from '@/hooks/useRole';
import { empresaOrigin } from '@/lib/hostEmpresa';
import { generatePassword } from '@/lib/generatePassword';
import { useToast } from '@/hooks/use-toast';
import { CandleIcon } from '@/components/icons/MemorialIcons';
import { AlertTriangle, ArrowLeft, KeyRound, Upload, Trash2, UserPlus, UserX, UserCheck } from 'lucide-react';

const ROLE_LABELS: Record<TenantRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  operador: 'Operador',
  viewer: 'Visualizador',
};

// The page background behind public cards (light theme --background).
const FUNDO_CLARO = '#F5F6F8';

// A wrapping <label> ties the text to the field inside it (click-to-focus, screen readers).
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-muted-foreground mb-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

// ------------------------------------------------------------------------------------------------

function DadosTab({ empresa, onSave, saving }: { empresa: EmpresaPlataforma; onSave: (d: Record<string, string | null>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    nome: empresa.nome,
    nome_exibicao: empresa.nome_exibicao,
    cnpj: empresa.cnpj ?? '',
    whatsapp_contato: empresa.whatsapp_contato ?? '',
    email_contato: empresa.email_contato ?? '',
    telefone: empresa.telefone ?? '',
  });
  const [endereco, setEndereco] = useState(() => enderecoForm(empresa));
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <Card className="shadow-soft max-w-3xl">
      <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
        <Field label="Nome fantasia *"><Input value={form.nome} onChange={set('nome')} /></Field>
        <Field label="Nome de exibição *"><Input value={form.nome_exibicao} onChange={set('nome_exibicao')} /></Field>
        <Field label="CNPJ"><Input value={form.cnpj} onChange={set('cnpj')} /></Field>
        <Field label="WhatsApp de contato"><Input value={form.whatsapp_contato} onChange={set('whatsapp_contato')} /></Field>
        <Field label="E-mail de contato"><Input type="email" value={form.email_contato} onChange={set('email_contato')} /></Field>
        <Field label="Telefone"><Input type="tel" value={form.telefone} onChange={set('telefone')} /></Field>
        <EmpresaEnderecoFields value={endereco} onChange={setEndereco} />
        <div className="hidden sm:block" />
        <Field label="Slug" hint="Usado no endereço da funerária e nos das câmeras; não pode ser alterado.">
          <Input value={empresa.slug} disabled />
        </Field>
        <Field label="Hash público" hint="Início dos links e QR codes das salas; mudar quebraria os já distribuídos.">
          <Input value={empresa.hash_publico} disabled />
        </Field>
        {empresaOrigin(empresa.slug) && (
          <Field label="Endereço da funerária" hint="Página do token e login do painel com a marca dela.">
            <Input value={empresaOrigin(empresa.slug)!} readOnly />
          </Field>
        )}
        <div className="sm:col-span-2 flex justify-end">
          <Button
            variant="gold"
            disabled={saving || !form.nome.trim() || !form.nome_exibicao.trim()}
            onClick={() =>
              onSave({
                nome: form.nome.trim(),
                nome_exibicao: form.nome_exibicao.trim(),
                cnpj: form.cnpj.trim() || null,
                whatsapp_contato: form.whatsapp_contato.trim() || null,
                email_contato: form.email_contato.trim() || null,
                telefone: form.telefone.trim() || null,
                ...enderecoParaApi(endereco),
              })
            }
          >
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------

function CorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <Field label={label} hint="Vazio = cor padrão Campax">
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 rounded border border-input bg-background p-1 cursor-pointer"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="#RRGGBB" className="font-mono" />
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>
            Limpar
          </Button>
        )}
      </div>
      {value && !valid && <p className="text-xs text-destructive mt-1">Use o formato #RRGGBB</p>}
    </Field>
  );
}

function IdentidadeTab({ empresa, hook }: { empresa: EmpresaPlataforma; hook: ReturnType<typeof usePlatformEmpresa> }) {
  const [cores, setCores] = useState({ cor_primaria: empresa.cor_primaria ?? '', cor_secundaria: empresa.cor_secundaria ?? '' });
  const [preview, setPreview] = useState<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const valid = (v: string) => !v || /^#[0-9a-fA-F]{6}$/.test(v);

  // Preview only: the colors are applied to the preview container, not to the whole page.
  useBranding(
    { cor_primaria: valid(cores.cor_primaria) ? cores.cor_primaria || null : null, cor_secundaria: valid(cores.cor_secundaria) ? cores.cor_secundaria || null : null },
    preview,
  );
  const contraste = cores.cor_primaria && valid(cores.cor_primaria) ? contrastRatio(cores.cor_primaria, FUNDO_CLARO) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
      <Card className="shadow-soft">
        <CardContent className="p-6 space-y-6">
          <div>
            <Label className="block text-sm text-muted-foreground mb-2">Logo</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-white border border-border p-1 flex items-center justify-center">
                <EmpresaLogo empresa={empresa} className="w-full h-full object-contain rounded-full" />
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) hook.uploadLogo.mutate(file);
                    e.target.value = '';
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={hook.uploadLogo.isPending}>
                  <Upload className="w-4 h-4 mr-2" />
                  {hook.uploadLogo.isPending ? 'Enviando...' : 'Enviar logo'}
                </Button>
                {empresa.logo_url && (
                  <Button variant="ghost" size="sm" onClick={() => hook.removeLogo.mutate()}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remover
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 2 MB.</p>
              </div>
            </div>
          </div>

          <CorInput label="Cor primária (destaques e botões)" value={cores.cor_primaria} onChange={(v) => setCores({ ...cores, cor_primaria: v })} />
          <CorInput label="Cor secundária (fundos escuros)" value={cores.cor_secundaria} onChange={(v) => setCores({ ...cores, cor_secundaria: v })} />

          {contraste !== null && contraste < 3 && (
            <p className="text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              A cor primária tem pouco contraste com o fundo claro ({contraste.toFixed(1)}:1). Textos e ícones nessa cor podem
              ficar difíceis de ler.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              variant="gold"
              disabled={!valid(cores.cor_primaria) || !valid(cores.cor_secundaria) || hook.update.isPending}
              onClick={() => hook.update.mutate({ cor_primaria: cores.cor_primaria || null, cor_secundaria: cores.cor_secundaria || null })}
            >
              Salvar cores
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="text-sm text-muted-foreground mb-2">Prévia (páginas públicas)</p>
        <div ref={setPreview} className="rounded-xl overflow-hidden border border-border">
          <div className="bg-primary px-4 py-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white p-0.5 flex items-center justify-center">
              <EmpresaLogo empresa={empresa} className="w-full h-full object-contain rounded-full" />
            </div>
            <span className="font-heading text-cream text-sm">{empresa.nome_exibicao}</span>
          </div>
          <div className="gradient-soft p-6">
            <div className="bg-card rounded-lg shadow-soft p-5">
              <div className="flex items-center gap-2 mb-2">
                <CandleIcon />
                <span className="text-xs uppercase tracking-wide text-gold">Velório em andamento</span>
              </div>
              <p className="font-heading text-lg text-foreground mb-3">Nome do Falecido</p>
              <Button variant="gold" className="w-full">Acessar transmissão</Button>
              <Button variant="outline-gold" className="w-full mt-2">Registrar Homenagem</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

function UsuariosTab({ empresaId }: { empresaId: string }) {
  const { data: usuarios = [], create, resetSenha, setAtivo } = usePlatformUsuarios(empresaId);
  const { toast } = useToast();
  const [novo, setNovo] = useState({ full_name: '', email: '', role: 'admin' as TenantRole, password: generatePassword(12) });
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; password: string } | null>(null);

  return (
    <div className="grid gap-6 max-w-4xl">
      <Card className="shadow-soft">
        <CardContent className="p-0 divide-y divide-border">
          {usuarios.map((u) => (
            <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${u.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {u.full_name || u.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {u.email} · {ROLE_LABELS[u.role]}
                  {!u.is_active && ' · desativado'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const password = generatePassword(12);
                    await resetSenha.mutateAsync({ userId: u.id, password });
                    setSenhaGerada({ email: u.email, password });
                  }}
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  Nova senha
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAtivo.mutate({ userId: u.id, is_active: !u.is_active })}>
                  {u.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                  {u.is_active ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {senhaGerada && (
        <Card className="border-gold/40 bg-gold/5">
          <CardContent className="p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1">
              Nova senha de <strong>{senhaGerada.email}</strong>: <code className="font-mono">{senhaGerada.password}</code>
              <span className="block text-xs text-muted-foreground">Mostrada só agora.</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(senhaGerada.password);
                toast({ title: 'Senha copiada' });
              }}
            >
              Copiar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSenhaGerada(null)}>
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-soft">
        <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
          <h3 className="font-heading text-lg sm:col-span-2">Novo usuário</h3>
          <Field label="Nome"><Input value={novo.full_name} onChange={(e) => setNovo({ ...novo, full_name: e.target.value })} /></Field>
          <Field label="E-mail *"><Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Field>
          <Field label="Papel">
            <Select value={novo.role} onValueChange={(v) => setNovo({ ...novo, role: v as TenantRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Senha inicial *"><Input value={novo.password} onChange={(e) => setNovo({ ...novo, password: e.target.value })} /></Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button
              variant="gold"
              disabled={!novo.email || novo.password.length < 8 || create.isPending}
              onClick={async () => {
                await create.mutateAsync({ email: novo.email.trim(), password: novo.password, role: novo.role, full_name: novo.full_name.trim() || undefined });
                setSenhaGerada({ email: novo.email.trim().toLowerCase(), password: novo.password });
                setNovo({ full_name: '', email: '', role: 'admin', password: generatePassword(12) });
              }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Criar usuário
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

function UsoTab({ empresa }: { empresa: EmpresaPlataforma }) {
  const itens: [string, number][] = [
    ['Usuários', empresa.uso.usuarios],
    ['Câmeras', empresa.uso.cameras],
    ['Salas', empresa.uso.salas],
    ['Velórios', empresa.uso.velorios],
    ['Ao vivo agora', empresa.uso.velorios_ao_vivo],
    ['Acessos (30 dias)', empresa.uso.acessos_30d],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl">
      {itens.map(([label, value]) => (
        <Card key={label} className="shadow-soft">
          <CardContent className="p-5">
            <p className="text-3xl font-semibold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

const PlatformEmpresaDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hook = usePlatformEmpresa(id);
  const { data: empresa, isLoading } = hook;
  const [confirmStatus, setConfirmStatus] = useState(false);

  // Keep the Dados form in sync after a save (it's keyed on updated values below).
  const [formKey, setFormKey] = useState(0);
  // Remount DadosTab when the saved data changes (e.g. the backend normalized the CEP/UF).
  const dadosVersao = empresa && JSON.stringify([
    empresa.nome, empresa.nome_exibicao, empresa.cnpj, empresa.whatsapp_contato, empresa.email_contato, empresa.telefone,
    enderecoForm(empresa),
  ]);
  useEffect(() => setFormKey((k) => k + 1), [dadosVersao]);

  if (isLoading || !empresa) {
    return (
      <PlatformLayout activeSection="empresas">
        <div className="text-center py-12 text-muted-foreground">{isLoading ? 'Carregando...' : 'Empresa não encontrada'}</div>
      </PlatformLayout>
    );
  }

  const suspender = empresa.ativo;

  return (
    <PlatformLayout activeSection="empresas">
      <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform')}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Empresas
      </Button>

      <header className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-full bg-white border border-border p-1 flex items-center justify-center shrink-0">
            <EmpresaLogo empresa={empresa} className="w-full h-full object-contain rounded-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-2xl sm:text-3xl text-foreground truncate">{empresa.nome_exibicao}</h1>
              <StatusBadge ativo={empresa.ativo} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{empresa.nome}</p>
          </div>
        </div>
        <Button variant={suspender ? 'destructive' : 'gold'} onClick={() => setConfirmStatus(true)}>
          {suspender ? 'Suspender' : 'Reativar'}
        </Button>
      </header>

      <Tabs defaultValue="dados">
        <TabsList className="mb-6 flex-wrap h-auto">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="identidade">Identidade visual</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="uso">Uso</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <DadosTab key={formKey} empresa={empresa} onSave={(d) => hook.update.mutate(d)} saving={hook.update.isPending} />
        </TabsContent>
        <TabsContent value="identidade">
          <IdentidadeTab empresa={empresa} hook={hook} />
        </TabsContent>
        <TabsContent value="usuarios">
          <UsuariosTab empresaId={empresa.id} />
        </TabsContent>
        <TabsContent value="uso">
          <UsoTab empresa={empresa} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmStatus} onOpenChange={setConfirmStatus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suspender ? `Suspender ${empresa.nome_exibicao}?` : `Reativar ${empresa.nome_exibicao}?`}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {suspender ? (
                  <>
                    <p>Nada é apagado. Enquanto estiver suspensa:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>ninguém da funerária consegue entrar no painel;</li>
                      <li>os links e tokens públicos mostram "indisponível";</li>
                      <li>as câmeras saem do servidor de vídeo.</li>
                    </ul>
                    {empresa.uso.velorios_ao_vivo > 0 && (
                      <p className="flex items-start gap-2 text-destructive font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        {empresa.uso.velorios_ao_vivo} velório(s) ao vivo agora serão interrompidos.
                      </p>
                    )}
                  </>
                ) : (
                  <p>O painel, os links públicos e as câmeras voltam a funcionar, com os mesmos endereços de antes.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={suspender ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={() => hook.setAtivo.mutate(!suspender)}
            >
              {suspender ? 'Suspender' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformLayout>
  );
};

export default PlatformEmpresaDetalhe;
