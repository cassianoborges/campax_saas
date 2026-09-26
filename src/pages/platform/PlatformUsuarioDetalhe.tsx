import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout, StatusBadge } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { usePlatformUsuarioGlobal } from '@/hooks/usePlatformUsuariosGlobais';
import { TenantRole } from '@/hooks/useRole';
import { generatePassword } from '@/lib/generatePassword';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, KeyRound, Link2, Trash2, UserCheck, UserX } from 'lucide-react';

const PlatformUsuarioDetalhe = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { data: usuario, isLoading, update, resetSenha, setAtivo, vincular, desvincular } = usePlatformUsuarioGlobal(id);
    const { data: empresas = [] } = usePlatformEmpresas();
    const [nome, setNome] = useState('');
    const [novaEmpresa, setNovaEmpresa] = useState('');
    const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

    useEffect(() => setNome(usuario?.full_name ?? ''), [usuario?.full_name]);

    if (isLoading || !usuario) {
        return <PlatformLayout activeSection="usuarios"><p className="text-muted-foreground">{isLoading ? 'Carregando…' : 'Usuário não encontrado.'}</p></PlatformLayout>;
    }

    const vinculadas = new Set(usuario.empresas.map((e) => e.id));
    const disponiveis = empresas.filter((e) => !vinculadas.has(e.id));

    return (
        <PlatformLayout activeSection="usuarios">
            <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform/usuarios')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Usuários
            </Button>
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <h1 className="font-heading text-3xl text-foreground">{usuario.full_name || usuario.email}</h1>
                <StatusBadge ativo={usuario.is_active} />
            </div>

            <div className="grid gap-6 max-w-3xl">
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="block text-sm text-muted-foreground mb-2">Nome</span>
                            <div className="flex gap-2">
                                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                                <Button variant="outline" disabled={update.isPending || nome === (usuario.full_name ?? '')} onClick={() => update.mutate({ full_name: nome.trim() || null })}>
                                    Salvar
                                </Button>
                            </div>
                        </label>
                        <label className="block">
                            <span className="block text-sm text-muted-foreground mb-2">Papel (vale em todas as empresas)</span>
                            <Select value={usuario.role} onValueChange={(v) => update.mutate({ role: v as TenantRole })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </label>
                        <p className="text-sm text-muted-foreground sm:col-span-2">E-mail (login): <span className="text-foreground">{usuario.email}</span></p>
                        <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    const password = generatePassword(12);
                                    await resetSenha.mutateAsync(password);
                                    setSenhaGerada(password);
                                }}
                            >
                                <KeyRound className="w-4 h-4 mr-2" />
                                Nova senha
                            </Button>
                            <Button variant="ghost" onClick={() => setAtivo.mutate(!usuario.is_active)}>
                                {usuario.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                                {usuario.is_active ? 'Desativar' : 'Ativar'}
                            </Button>
                        </div>
                        {senhaGerada && (
                            <div className="sm:col-span-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm flex flex-wrap items-center gap-3">
                                <span className="flex-1">Nova senha: <code className="font-mono">{senhaGerada}</code> <span className="block text-xs text-muted-foreground">Mostrada só agora. Os acessos abertos com a senha antiga foram encerrados.</span></span>
                                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(senhaGerada); toast({ title: 'Senha copiada' }); }}>Copiar</Button>
                                <Button variant="ghost" size="sm" onClick={() => setSenhaGerada(null)}>Fechar</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4">
                        <h2 className="font-heading text-lg">Empresas</h2>
                        {usuario.empresas.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sem empresa vinculada: o usuário não consegue entrar.</p>
                        )}
                        {usuario.empresas.map((e) => (
                            <div key={e.id} className="flex items-center gap-3">
                                <button type="button" className="flex-1 text-left hover:text-gold" onClick={() => navigate(`/platform/empresas/${e.id}`)}>
                                    {e.nome_exibicao}
                                    {!e.ativo && <span className="ml-2 text-xs text-muted-foreground">(suspensa)</span>}
                                </button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={desvincular.isPending} onClick={() => desvincular.mutate(e.id)}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remover
                                </Button>
                            </div>
                        ))}
                        {disponiveis.length > 0 && (
                            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                                <Select value={novaEmpresa} onValueChange={setNovaEmpresa}>
                                    <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Escolha uma empresa" /></SelectTrigger>
                                    <SelectContent>
                                        {disponiveis.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_exibicao}{!e.ativo ? ' (suspensa)' : ''}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="gold"
                                    disabled={!novaEmpresa || vincular.isPending}
                                    onClick={async () => {
                                        await vincular.mutateAsync(novaEmpresa);
                                        setNovaEmpresa('');
                                    }}
                                >
                                    <Link2 className="w-4 h-4 mr-2" />
                                    Vincular empresa
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </PlatformLayout>
    );
};

export default PlatformUsuarioDetalhe;
