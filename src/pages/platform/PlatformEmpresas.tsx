import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PlatformLayout, StatusBadge } from '@/components/PlatformLayout';
import { EmpresaLogo } from '@/components/EmpresaLogo';
import { usePlatformEmpresas, EmpresaPlataforma } from '@/hooks/usePlatform';
import { Building, Plus, Search, Radio } from 'lucide-react';

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center min-w-[64px]">
      <p className={`text-lg font-semibold ${highlight && value > 0 ? 'text-red-500' : 'text-foreground'}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function EmpresaCard({ empresa, onOpen }: { empresa: EmpresaPlataforma; onOpen: () => void }) {
  const { uso } = empresa;
  return (
    <Card className="shadow-soft hover:shadow-elegant transition-shadow cursor-pointer min-w-0" onClick={onOpen}>
      <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-full bg-white border border-border p-0.5 flex items-center justify-center shrink-0">
            <EmpresaLogo empresa={empresa} className="w-full h-full object-contain rounded-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-foreground truncate">{empresa.nome_exibicao}</h3>
              <StatusBadge ativo={empresa.ativo} />
              {uso.velorios_ao_vivo > 0 && (
                <span className="text-xs flex items-center gap-1 text-red-500">
                  <Radio className="w-3 h-3" /> {uso.velorios_ao_vivo} ao vivo
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {empresa.slug} · criada em {new Date(empresa.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2 lg:flex lg:gap-4">
          <Metric label="Câmeras" value={uso.cameras} />
          <Metric label="Salas" value={uso.salas} />
          <Metric label="Velórios" value={uso.velorios} />
          <Metric label="Usuários" value={uso.usuarios} />
          <Metric label="Acessos 30d" value={uso.acessos_30d} />
        </div>
      </CardContent>
    </Card>
  );
}

const PlatformEmpresas = () => {
  const navigate = useNavigate();
  const { data: empresas = [], isLoading } = usePlatformEmpresas();
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((e) => [e.nome, e.nome_exibicao, e.slug].some((v) => v.toLowerCase().includes(termo)));
  }, [empresas, busca]);

  return (
    <PlatformLayout activeSection="empresas">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Empresas</h1>
          <p className="text-muted-foreground">Funerárias atendidas pela plataforma</p>
        </div>
        <Button variant="gold" onClick={() => navigate('/platform/empresas/nova')}>
          <Plus className="w-4 h-4 mr-2" />
          Nova empresa
        </Button>
      </header>

      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou slug" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando empresas...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{busca ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtradas.map((empresa) => (
            <EmpresaCard key={empresa.id} empresa={empresa} onOpen={() => navigate(`/platform/empresas/${empresa.id}`)} />
          ))}
        </div>
      )}
    </PlatformLayout>
  );
};

export default PlatformEmpresas;
