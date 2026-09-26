import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { usePlatformUsuariosGlobais } from '@/hooks/usePlatformUsuariosGlobais';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { Search, UserPlus } from 'lucide-react';

const TODAS = 'todas';

const PlatformUsuarios = () => {
    const navigate = useNavigate();
    const [busca, setBusca] = useState('');
    const [empresaId, setEmpresaId] = useState(TODAS);
    const { data: empresas = [] } = usePlatformEmpresas();
    const { data: usuarios = [], isLoading } = usePlatformUsuariosGlobais({ busca, empresaId: empresaId === TODAS ? '' : empresaId });

    return (
        <PlatformLayout activeSection="usuarios">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h1 className="font-heading text-3xl text-foreground">Usuários</h1>
                <Button variant="gold" onClick={() => navigate('/platform/usuarios/novo')}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Novo usuário
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4 max-w-4xl">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-10" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                        <SelectItem value="nenhuma">Sem empresa</SelectItem>
                        {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_exibicao}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <Card className="shadow-soft max-w-4xl">
                <CardContent className="p-0 divide-y divide-border">
                    {isLoading && <p className="p-6 text-muted-foreground">Carregando…</p>}
                    {!isLoading && usuarios.length === 0 && <p className="p-6 text-muted-foreground">Nenhum usuário encontrado.</p>}
                    {usuarios.map((u) => (
                        <button
                            key={u.id}
                            type="button"
                            onClick={() => navigate(`/platform/usuarios/${u.id}`)}
                            className="w-full p-4 flex flex-col sm:flex-row sm:items-center gap-2 text-left hover:bg-gold/5"
                        >
                            <div className="flex-1 min-w-0">
                                <p className={`font-medium truncate ${u.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                    {u.full_name || u.email}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {u.email} · {ROLE_LABELS[u.role]}{!u.is_active && ' · desativado'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1 sm:justify-end sm:max-w-[50%]">
                                {u.empresas.length === 0 ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground">Sem empresa</span>
                                ) : (
                                    u.empresas.map((e) => (
                                        <span key={e.id} className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-foreground">{e.nome_exibicao}</span>
                                    ))
                                )}
                            </div>
                        </button>
                    ))}
                </CardContent>
            </Card>
        </PlatformLayout>
    );
};

export default PlatformUsuarios;
