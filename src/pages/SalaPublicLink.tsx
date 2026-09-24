import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CrossIcon, CandleIcon } from '@/components/icons/MemorialIcons';
import { useSalaPublicLink } from '@/hooks/useSalaPublicLink';
import { EmpresaLogo, TransmissaoPorCampax } from '@/components/EmpresaLogo';
import { useBranding, useDocumentTitle } from '@/hooks/useBranding';
import NotFound from './NotFound';
import { RegistrarHomenagemDialog } from '@/components/RegistrarHomenagemDialog';

function formatDateHora(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const SalaPublicLink = () => {
  const { hashEmpresa, salaSlug } = useParams<{ hashEmpresa: string; salaSlug: string }>();
  const navigate = useNavigate();
  // Unknown hash, a sala of another empresa and a suspended empresa all come back as 404 → NotFound.
  const { data, isLoading } = useSalaPublicLink(hashEmpresa, salaSlug);
  useBranding(data?.empresa);
  useDocumentTitle(data ? `${data.sala.nome_sala_velorio} — ${data.empresa.nome_exibicao}` : null);

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-soft flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <NotFound />;
  }

  const { sala, atual, proximo, empresa } = data;
  const cidadeEstado = [sala.cidade, sala.estado].filter(Boolean).join('/');
  const velorio = atual ?? proximo;

  return (
    <div className="min-h-screen gradient-soft flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full">
        <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
          <EmpresaLogo empresa={empresa} className="w-full h-full object-contain drop-shadow" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">{empresa.nome_exibicao}</p>
        <CrossIcon />
        <h1 className="font-heading text-2xl text-foreground mt-4 mb-1">{sala.nome_sala_velorio}</h1>
        {cidadeEstado && <p className="text-muted-foreground text-sm mb-6">{cidadeEstado}</p>}

        {velorio ? (
          <div className="bg-card rounded-lg shadow-soft p-6 text-left">
            <div className="flex items-center gap-2 mb-3">
              <CandleIcon />
              <span className="text-xs uppercase tracking-wide text-gold">
                {atual ? 'Velório em andamento' : 'Próximo velório'}
              </span>
            </div>
            <p className="font-heading text-xl text-foreground mb-2">{velorio.nome_falecido}</p>
            <p className="text-sm text-muted-foreground mb-1">
              Início: {formatDateHora(velorio.data_inicio)}
            </p>
            {velorio.data_sepultamento && (
              <p className="text-sm text-muted-foreground mb-4">
                Sepultamento: {formatDateHora(velorio.data_sepultamento)}
              </p>
            )}
            <Button variant="gold" className="w-full mt-2" onClick={() => navigate('/')}>
              Acessar transmissão
            </Button>
            <RegistrarHomenagemDialog
              velorio_id={velorio.id}
              velorio_nome={velorio.nome_falecido}
              trigger={
                <Button variant="outline-gold" className="w-full mt-3">
                  Registrar Homenagem
                </Button>
              }
            />
          </div>
        ) : (
          <p className="text-muted-foreground mt-6">Nenhum velório em andamento no momento.</p>
        )}
        <TransmissaoPorCampax className="mt-8 text-muted-foreground" />
      </div>
    </div>
  );
};

export default SalaPublicLink;
