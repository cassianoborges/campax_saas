import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { raiz, SERIF } from './estilos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, Rodape } from './partes';

/** Big photo on the top half fading into the secondary color, text block below. */
export function ModeloModerno({ dados }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria, textoSobrePrimaria } = dados.empresa;
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria }}>
      {dados.fotoUrl ? (
        <div style={{ position: 'relative', width: '100%', height: 560, flexShrink: 0 }}>
          <img src={dados.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 45%, ${corSecundaria} 100%)` }} />
        </div>
      ) : (
        <div style={{ width: '100%', height: 24, background: corPrimaria, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: dados.fotoUrl ? '0 90px 56px' : '64px 90px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        {!dados.fotoUrl && <LogoOuNome empresa={dados.empresa} cor={corPrimaria} />}
        <Chamada cor={corPrimaria} />
        <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (dados.fotoUrl ? 1 : 1.2), fontWeight: 700, lineHeight: 1.1 }}>{dados.nome}</div>
        <Datas dados={dados} cor={textoSobreSecundaria} />
        <Familiares dados={dados} cor={textoSobreSecundaria} />
        <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} />
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 24 }}>
          {dados.fotoUrl ? <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={80} /> : <span />}
          <div style={{ padding: dados.empresa.contato ? '8px 20px' : 0, borderRadius: 999, background: dados.empresa.contato ? corPrimaria : 'transparent' }}>
            <Rodape dados={dados} cor={textoSobrePrimaria} />
          </div>
        </div>
      </div>
    </div>
  );
}
