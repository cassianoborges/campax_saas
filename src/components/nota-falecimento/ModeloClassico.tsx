import { notaCompacta, tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { raiz, SERIF } from './estilos';
import { Chamada, Datas, Familiares, Filete, Informacoes, LogoOuNome, Miolo, Rodape } from './partes';

/** Dark background (secondary color), accents in the primary color, round photo. */
export function ModeloClassico({ dados }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria } = dados.empresa;
  const compacta = notaCompacta(dados);
  const foto = compacta ? 250 : 340;
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria, padding: compacta ? '56px 90px 48px' : '64px 90px 56px', gap: compacta ? 18 : 26 }}>
      <div style={{ position: 'absolute', inset: 28, border: `2px solid ${corPrimaria}`, borderRadius: 12, opacity: 0.6 }} />
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={compacta ? 90 : 110} />
      <Miolo gap={compacta ? 18 : 26}>
        <Chamada cor={corPrimaria} />
        {dados.fotoUrl && (
          <img src={dados.fotoUrl} alt="" style={{ width: foto, height: foto, flexShrink: 0, borderRadius: '50%', objectFit: 'cover', border: `8px solid ${corPrimaria}` }} />
        )}
        <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (dados.fotoUrl ? 1 : 1.2), fontWeight: 600, lineHeight: 1.1 }}>{dados.nome}</div>
        <Datas dados={dados} cor={textoSobreSecundaria} />
        <Filete cor={corPrimaria} />
        <Familiares dados={dados} cor={textoSobreSecundaria} />
        <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} compacta={compacta} />
      </Miolo>
      <Rodape dados={dados} cor={textoSobreSecundaria} />
    </div>
  );
}
