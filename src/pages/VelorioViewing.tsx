import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CrossIcon, CandleIcon } from '@/components/icons/MemorialIcons';
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { MuralHomenagens } from '@/components/MuralHomenagens';
import { OnlineCounter } from '@/components/OnlineCounter';
import { VisitantesCounter } from '@/components/VisitantesCounter';
import { ArrowLeft, Video, Radio, Maximize, MapPin } from 'lucide-react';
import { EmpresaLogo, TransmissaoPorCampax } from '@/components/EmpresaLogo';
import { useBranding, useDocumentTitle } from '@/hooks/useBranding';

function formatDateBR(dateStr: string): string {
  // The API sends @db.Date columns as "YYYY-MM-DDT00:00:00.000Z"; only the date part matters.
  const [year, month, day] = dateStr.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const VelorioViewing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { useVelorio } = useVelorios();
  const { data: velorio, isLoading } = useVelorio(id);
  useBranding(velorio?.empresa);
  useDocumentTitle(velorio ? [velorio.nome_falecido, velorio.empresa?.nome_exibicao].filter(Boolean).join(' — ') : null);

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

  if (!velorio) {
    return (
      <div className="min-h-screen gradient-soft flex items-center justify-center p-6">
        <div className="text-center">
          <CrossIcon />
          <p className="mt-4 text-muted-foreground">Velório não encontrado</p>
          <Button variant="outline-gold" className="mt-6" onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  const status = getVelorioStatus(velorio);
  const cameras = velorio.sala?.sala_velorio_cameras?.map(vc => vc.cameras).filter(Boolean) || [];

  const sala = velorio.sala;
  const cidadeEstado = [sala?.cidade, sala?.estado].filter(Boolean).join('/');
  const enderecoCompleto = [sala?.endereco, sala?.bairro, cidadeEstado, sala?.cep].filter(Boolean).join(' — ');

  const linhaVida = [velorio.data_nascimento, velorio.data_falecimento]
    .filter((d): d is string => Boolean(d))
    .map(formatDateBR)
    .join(' — ');

  const temSepultamento = Boolean(
    velorio.data_sepultamento || velorio.local_sepultamento || velorio.google_maps_url_sepultamento
  );

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Header */}
      <header className="border-b border-gold/20 bg-primary/95 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-cream hover:text-gold hover:bg-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Sair
          </Button>

          {velorio.empresa && (
            <div className="flex items-center gap-2 order-first sm:order-none w-full sm:w-auto justify-center">
              <div className="w-10 h-10 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0">
                <EmpresaLogo empresa={velorio.empresa} className="w-full h-full object-contain rounded-full" />
              </div>
              <span className="font-heading text-cream text-sm sm:text-base">{velorio.empresa.nome_exibicao}</span>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <VisitantesCounter velorio_id={id!} />
            <div className="flex items-center gap-2">
              <Radio className="w-3 h-3 animate-gentle-pulse text-red-400" />
              <span className="text-cream/70 text-sm">
                {status === 'Ao Vivo' ? 'Transmissão ao vivo' : status}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col">
        {/* Memorial header */}
        <div className="text-center mb-6 animate-fade-in flex-shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full gradient-elegant mb-4 shadow-elegant overflow-hidden">
            {velorio.foto_falecido ? (
              <img
                src={velorio.foto_falecido}
                alt={velorio.nome_falecido}
                className="w-full h-full object-cover"
              />
            ) : (
              <CrossIcon />
            )}
          </div>
          <h1 className="font-heading text-3xl md:text-4xl text-cream mb-2">
            {velorio.nome_falecido}
          </h1>
          {linhaVida && (
            <p className="text-cream/60 text-sm mb-1">{linhaVida}</p>
          )}
          <div className="flex items-center justify-center gap-2 text-cream/60 mb-1">
            <CandleIcon />
            <p className="text-base">{sala?.nome_sala_velorio}</p>
          </div>
          {enderecoCompleto && (
            <p className="text-cream/50 text-sm mb-1 flex items-center justify-center gap-2 flex-wrap">
              <span>{enderecoCompleto}</span>
              {sala?.google_maps_url && (
                <a
                  href={sala.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline"
                >
                  <MapPin className="w-3 h-3" />
                  Ver no Google Maps
                </a>
              )}
            </p>
          )}
          <p className="text-cream/50 text-sm">
            {new Date(velorio.data_inicio).toLocaleDateString('pt-BR')} —{' '}
            {new Date(velorio.data_fim).toLocaleDateString('pt-BR')}
          </p>
          {velorio.mensagem_homenagem && (
            <p className="text-cream/80 text-sm italic max-w-2xl mx-auto mt-3">
              "{velorio.mensagem_homenagem}"
            </p>
          )}
          {temSepultamento && (
            <div className="mt-4 inline-block bg-primary/50 rounded-lg px-4 py-3 text-left">
              <p className="text-gold text-xs uppercase tracking-wide mb-1">Sepultamento</p>
              {velorio.data_sepultamento && (
                <p className="text-cream/70 text-sm">
                  {new Date(velorio.data_sepultamento).toLocaleDateString('pt-BR')}{' '}
                  às{' '}
                  {new Date(velorio.data_sepultamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {velorio.local_sepultamento && (
                <p className="text-cream/70 text-sm">{velorio.local_sepultamento}</p>
              )}
              {velorio.google_maps_url_sepultamento && (
                <a
                  href={velorio.google_maps_url_sepultamento}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline text-sm mt-1"
                >
                  <MapPin className="w-3 h-3" />
                  Ver no Google Maps
                </a>
              )}
            </div>
          )}
        </div>

        {/* Two-column layout: videos + mural */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Left: video grid */}
          <div className="lg:w-2/3 flex flex-col">
            <div className="relative">
              {cameras.length > 0 ? (
                <div
                  className={`grid gap-4 ${
                    cameras.length === 1
                      ? 'grid-cols-1'
                      : cameras.length === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'
                  }`}
                >
                  {cameras.map((camera) =>
                    camera.stream_url ? (
                      <div
                        key={camera.id}
                        className="group relative bg-black rounded-lg overflow-hidden aspect-video shadow-elegant"
                      >
                        <iframe
                          src={camera.stream_url}
                          className="w-full h-full border-0"
                          allow="autoplay; camera; microphone"
                          allowFullScreen
                          title={camera.nome}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-white text-sm font-medium">{camera.nome}</p>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 text-xs text-green-400">
                                <Radio className="w-3 h-3 animate-pulse" />
                                <span>AO VIVO</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  const container = (e.currentTarget as HTMLElement).closest('.group');
                                  container?.requestFullscreen?.();
                                }}
                                className="text-white/70 hover:text-white transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                title="Tela cheia"
                              >
                                <Maximize className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={camera.id}
                        className="relative bg-primary/90 rounded-lg overflow-hidden aspect-video shadow-elegant"
                      >
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-cream">
                          <Video className="w-12 h-12 mb-4 opacity-50" />
                          <p className="text-sm opacity-70 mb-2">{camera.nome}</p>
                          <p className="text-xs opacity-50">
                            {status === 'Ao Vivo' ? 'Aguardando sincronização...' : 'A transmissão fica disponível durante o velório'}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 mx-auto mb-4 text-cream/30" />
                  <p className="text-cream/50">Nenhuma câmera disponível no momento</p>
                </div>
              )}

              {/* Online presence counter — always visible, overlaid bottom-right */}
              <OnlineCounter velorio_id={id!} />
            </div>
          </div>

          {/* Right: tribute wall */}
          <div className="lg:w-1/3 min-h-[400px] lg:min-h-0 flex flex-col">
            <MuralHomenagens velorio_id={id!} />
          </div>
        </div>
      </main>

      {velorio.empresa && <TransmissaoPorCampax className="text-cream pb-4" />}
    </div>
  );
};

export default VelorioViewing;
