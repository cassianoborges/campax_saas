import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { raiz, SERIF } from './estilos';
import { Chamada, Datas, Familiares, Filete, Informacoes, LogoOuNome, Rodape } from './partes';

/** Dark background (secondary color), accents in the primary color, round photo. */
export function ModeloClassico({ dados }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria } = dados.empresa;
  const semFoto = !dados.fotoUrl;
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria, padding: '64px 90px', gap: 26, justifyContent: semFoto ? 'center' : 'flex-start' }}>
      <div style={{ position: 'absolute', inset: 28, border: `2px solid ${corPrimaria}`, borderRadius: 12, opacity: 0.6 }} />
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} />
      <Chamada cor={corPrimaria} />
      {dados.fotoUrl && (
        <img src={dados.fotoUrl} alt="" style={{ width: 340, height: 340, borderRadius: '50%', objectFit: 'cover', border: `8px solid ${corPrimaria}` }} />
      )}
      <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (semFoto ? 1.2 : 1), fontWeight: 600, lineHeight: 1.1 }}>{dados.nome}</div>
      <Datas dados={dados} cor={textoSobreSecundaria} />
      <Filete cor={corPrimaria} />
      <Familiares dados={dados} cor={textoSobreSecundaria} />
      <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} />
      <div style={{ marginTop: 'auto' }}>
        <Rodape dados={dados} cor={textoSobreSecundaria} />
      </div>
    </div>
  );
}
