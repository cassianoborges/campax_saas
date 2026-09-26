import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { MEDIDAS, raiz } from './estilos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, Miolo, Nome, Rodape } from './partes';

const FOTO = [560, 400, 280];

/** Big photo on the top half fading into the secondary color, text block below. */
export function ModeloModerno({ dados, densidade = 0 }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria, textoSobrePrimaria } = dados.empresa;
  const d = densidade;
  const gap = [22, 16, 10][d];
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria }}>
      {dados.fotoUrl ? (
        <div style={{ position: 'relative', width: '100%', height: FOTO[d], flexShrink: 0 }}>
          <img src={dados.fotoUrl} alt="" style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 45%, ${corSecundaria} 100%)` }} />
        </div>
      ) : (
        <div style={{ width: '100%', height: 24, background: corPrimaria, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: `${dados.fotoUrl ? 0 : 56}px 90px ${[48, 40, 32][d]}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
        {!dados.fotoUrl && <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={MEDIDAS.logo[d]} />}
        <Miolo gap={gap}>
          <Chamada cor={corPrimaria} densidade={d} />
          <Nome nome={dados.nome} tamanho={tamanhoNome(dados.nome) * MEDIDAS.escalaNome[d] * (dados.fotoUrl ? 1 : 1.2)} peso={700} />
          <Datas dados={dados} cor={textoSobreSecundaria} densidade={d} />
          <Familiares dados={dados} cor={textoSobreSecundaria} densidade={d} />
          <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} densidade={d} />
        </Miolo>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 24, flexShrink: 0 }}>
          {dados.fotoUrl ? <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={[80, 68, 56][d]} /> : <span />}
          <div style={{ padding: dados.empresa.contato ? '8px 20px' : 0, borderRadius: 999, background: dados.empresa.contato ? corPrimaria : 'transparent' }}>
            <Rodape dados={dados} cor={textoSobrePrimaria} densidade={d} />
          </div>
        </div>
      </div>
    </div>
  );
}
