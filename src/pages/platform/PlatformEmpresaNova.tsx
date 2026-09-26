import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmpresaEnderecoFields } from '@/components/EmpresaEnderecoFields';
import { enderecoForm, enderecoParaApi } from '@/lib/empresaEndereco';
import { Card, CardContent } from '@/components/ui/card';
import { PlatformLayout } from '@/components/PlatformLayout';
import { useCreateEmpresa, EmpresaPlataforma } from '@/hooks/usePlatform';
import { generatePassword } from '@/lib/generatePassword';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, CheckCircle2, Copy, RefreshCw } from 'lucide-react';

/** Same rule as the backend's slugify: "Funerária São José" → "funeraria-sao-jose". */
function slugify(nome: string) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

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

function CopyLine({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center justify-between gap-3 bg-muted/50 rounded-md px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-mono text-foreground break-all">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast({ title: 'Copiado' });
        }}
      >
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );
}

const PlatformEmpresaNova = () => {
  const navigate = useNavigate();
  const createEmpresa = useCreateEmpresa();
  const [empresa, setEmpresa] = useState({ nome: '', nome_exibicao: '', slug: '', cnpj: '', whatsapp_contato: '', email_contato: '', telefone: '' });
  const [endereco, setEndereco] = useState(() => enderecoForm());
  const [slugEditado, setSlugEditado] = useState(false);
  const [superadmin, setSuperadmin] = useState({ full_name: '', email: '', password: generatePassword(12) });
  const [criada, setCriada] = useState<EmpresaPlataforma | null>(null);

  const setNome = (nome: string) =>
    setEmpresa((e) => ({
      ...e,
      nome,
      nome_exibicao: e.nome_exibicao && e.nome_exibicao !== e.nome ? e.nome_exibicao : nome,
      slug: slugEditado ? e.slug : slugify(nome),
    }));

  const podeSalvar = empresa.nome.trim() && empresa.nome_exibicao.trim() && empresa.slug && superadmin.email && superadmin.password.length >= 8;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = (value: string) => value.trim() || undefined;
    try {
      setCriada(
        await createEmpresa.mutateAsync({
          empresa: {
            nome: empresa.nome.trim(),
            nome_exibicao: empresa.nome_exibicao.trim(),
            slug: empresa.slug,
            cnpj: clean(empresa.cnpj),
            whatsapp_contato: clean(empresa.whatsapp_contato),
            email_contato: clean(empresa.email_contato),
            telefone: clean(empresa.telefone),
            ...enderecoParaApi(endereco),
          },
          superadmin: { email: superadmin.email.trim(), password: superadmin.password, full_name: clean(superadmin.full_name) },
        }),
      );
    } catch {
      // the hook's onError already shows the toast
    }
  };

  if (criada) {
    // Credentials are shown only here, once — there is no e-mail sending in the system.
    return (
      <PlatformLayout activeSection="empresas">
        <Card className="max-w-2xl shadow-elegant">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <h1 className="font-heading text-2xl text-foreground">Empresa criada</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Envie os dados abaixo ao responsável pela <strong>{criada.nome_exibicao}</strong>. A senha não será mostrada
              de novo; mande-a por um canal diferente do e-mail de login.
            </p>
            <CopyLine label="Painel" value={`${window.location.origin}/admin`} />
            <CopyLine label="Login" value={superadmin.email.trim().toLowerCase()} />
            <CopyLine label="Senha inicial" value={superadmin.password} />
            <CopyLine label="Início dos links públicos das salas" value={`${window.location.origin}/${criada.hash_publico}/`} />
            <div className="flex justify-end">
              <Button variant="gold" onClick={() => navigate(`/platform/empresas/${criada.id}`)}>
                Abrir empresa
              </Button>
            </div>
          </CardContent>
        </Card>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout activeSection="empresas">
      <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform')}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Empresas
      </Button>
      <h1 className="font-heading text-3xl text-foreground mb-6">Nova empresa</h1>

      <form onSubmit={handleSubmit} className="grid gap-6 max-w-3xl">
        <Card className="shadow-soft">
          <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <h2 className="font-heading text-lg sm:col-span-2">Empresa</h2>
            <Field label="Nome fantasia *">
              <Input value={empresa.nome} onChange={(e) => setNome(e.target.value)} required />
            </Field>
            <Field label="Nome de exibição *" hint="Aparece nas páginas públicas e no painel da funerária">
              <Input value={empresa.nome_exibicao} onChange={(e) => setEmpresa({ ...empresa, nome_exibicao: e.target.value })} required />
            </Field>
            <Field label="Slug *" hint="Identificador curto; não pode ser alterado depois">
              <Input
                value={empresa.slug}
                onChange={(e) => {
                  setSlugEditado(true);
                  setEmpresa({ ...empresa, slug: slugify(e.target.value) });
                }}
                required
              />
            </Field>
            <Field label="CNPJ">
              <Input value={empresa.cnpj} onChange={(e) => setEmpresa({ ...empresa, cnpj: e.target.value })} />
            </Field>
            <Field label="WhatsApp de contato">
              <Input value={empresa.whatsapp_contato} onChange={(e) => setEmpresa({ ...empresa, whatsapp_contato: e.target.value })} />
            </Field>
            <Field label="E-mail de contato">
              <Input type="email" value={empresa.email_contato} onChange={(e) => setEmpresa({ ...empresa, email_contato: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <Input type="tel" value={empresa.telefone} onChange={(e) => setEmpresa({ ...empresa, telefone: e.target.value })} />
            </Field>
            <EmpresaEnderecoFields value={endereco} onChange={setEndereco} />
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="font-heading text-lg">Primeiro superadmin</h2>
              <p className="text-xs text-muted-foreground">O responsável da funerária; ele cria os demais usuários.</p>
            </div>
            <Field label="Nome">
              <Input value={superadmin.full_name} onChange={(e) => setSuperadmin({ ...superadmin, full_name: e.target.value })} />
            </Field>
            <Field label="E-mail (login) *">
              <Input type="email" value={superadmin.email} onChange={(e) => setSuperadmin({ ...superadmin, email: e.target.value })} required />
            </Field>
            <Field label="Senha inicial *" hint="Mínimo de 8 caracteres">
              <div className="flex gap-2">
                <Input value={superadmin.password} onChange={(e) => setSuperadmin({ ...superadmin, password: e.target.value })} required />
                <Button type="button" variant="outline" size="icon" onClick={() => setSuperadmin({ ...superadmin, password: generatePassword(12) })} aria-label="Gerar senha">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/platform')}>
            Cancelar
          </Button>
          <Button type="submit" variant="gold" disabled={!podeSalvar || createEmpresa.isPending}>
            {createEmpresa.isPending ? 'Criando...' : 'Criar empresa'}
          </Button>
        </div>
      </form>
    </PlatformLayout>
  );
};

export default PlatformEmpresaNova;
