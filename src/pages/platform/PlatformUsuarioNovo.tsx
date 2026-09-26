import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { useCreateUsuarioGlobal, UsuarioGlobal } from '@/hooks/usePlatformUsuariosGlobais';
import { TenantRole } from '@/hooks/useRole';
import { generatePassword } from '@/lib/generatePassword';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="block text-sm text-muted-foreground mb-2">{label}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
        </label>
    );
}

const PlatformUsuarioNovo = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const create = useCreateUsuarioGlobal();
    const { data: empresas = [] } = usePlatformEmpresas();
    const [form, setForm] = useState({ full_name: '', email: '', role: 'admin' as TenantRole, password: generatePassword(12) });
    const [empresaIds, setEmpresaIds] = useState<string[]>([]);
    const [criado, setCriado] = useState<UsuarioGlobal | null>(null);

    const alternar = (id: string, marcado: boolean) =>
        setEmpresaIds((ids) => (marcado ? [...ids, id] : ids.filter((x) => x !== id)));

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        const user = await create.mutateAsync({
            email: form.email.trim(), password: form.password, role: form.role,
            full_name: form.full_name.trim() || undefined, empresa_ids: empresaIds,
        });
        setCriado(user);
    };

    if (criado) {
        // Credentials are shown only here, once — there is no e-mail sending in the system.
        const copiar = (texto: string) => {
            navigator.clipboard.writeText(texto);
            toast({ title: 'Copiado' });
        };
        return (
            <PlatformLayout activeSection="usuarios">
                <Card className="shadow-soft max-w-2xl border-gold/40">
                    <CardContent className="p-6 grid gap-4">
                        <h1 className="font-heading text-2xl">Usuário criado</h1>
                        <p className="text-sm text-muted-foreground">Envie os dados abaixo para a pessoa. A senha não será mostrada de novo.</p>
                        <div className="flex items-center gap-2"><code className="flex-1 font-mono text-sm">{criado.email}</code><Button variant="outline" size="sm" onClick={() => copiar(criado.email)}>Copiar</Button></div>
                        <div className="flex items-center gap-2"><code className="flex-1 font-mono text-sm">{form.password}</code><Button variant="outline" size="sm" onClick={() => copiar(form.password)}>Copiar</Button></div>
                        {criado.empresas.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sem empresa vinculada: ele só consegue entrar depois de ser vinculado a uma.</p>
                        )}
                        <div className="flex justify-end">
                            <Button variant="gold" onClick={() => navigate(`/platform/usuarios/${criado.id}`)}>Ir para o usuário</Button>
                        </div>
                    </CardContent>
                </Card>
            </PlatformLayout>
        );
    }

    return (
        <PlatformLayout activeSection="usuarios">
            <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform/usuarios')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Usuários
            </Button>
            <h1 className="font-heading text-3xl text-foreground mb-6">Novo usuário</h1>
            <form onSubmit={salvar} className="grid gap-6 max-w-3xl">
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
                        <Field label="Nome"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
                        <Field label="E-mail (login) *"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                        <Field label="Papel" hint="Vale em todas as empresas do usuário">
                            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as TenantRole })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Senha inicial *" hint="Mínimo de 8 caracteres">
                            <div className="flex gap-2">
                                <Input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                                <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: generatePassword(12) })}>Gerar</Button>
                            </div>
                        </Field>
                    </CardContent>
                </Card>
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-3">
                        <h2 className="font-heading text-lg">Empresas</h2>
                        <p className="text-xs text-muted-foreground">Opcional. Sem nenhuma, o usuário fica cadastrado mas não consegue entrar.</p>
                        {empresas.map((e) => (
                            <label key={e.id} className="flex items-center gap-3 text-sm">
                                <Checkbox checked={empresaIds.includes(e.id)} onCheckedChange={(v) => alternar(e.id, v === true)} />
                                {e.nome_exibicao}
                                {!e.ativo && <span className="text-xs text-muted-foreground">(suspensa)</span>}
                            </label>
                        ))}
                    </CardContent>
                </Card>
                <div className="flex justify-end">
                    <Button type="submit" variant="gold" disabled={create.isPending || !form.email || form.password.length < 8}>
                        Criar usuário
                    </Button>
                </div>
            </form>
        </PlatformLayout>
    );
};

export default PlatformUsuarioNovo;
