import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { MEDIDAS, raiz } from './estilos';
import { Chamada, Datas, Familiares, Filete, Informacoes, LogoOuNome, Miolo, Nome, Rodape } from './partes';

const FOTO = [340, 250, 180];

/** Dark background (secondary color), accents in the primary color, round photo. */
export function ModeloClassico({ dados, densidade = 0 }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria } = dados.empresa;
  const d = densidade;
  const gap = MEDIDAS.gap[d];
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria, padding: `${[64, 56, 48][d]}px 90px ${[56, 48, 44][d]}px`, gap }}>
      <div style={{ position: 'absolute', inset: 28, border: `2px solid ${corPrimaria}`, borderRadius: 12, opacity: 0.6 }} />
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={MEDIDAS.logo[d]} />
      <Miolo gap={gap}>
        <Chamada cor={corPrimaria} densidade={d} />
        {dados.fotoUrl && (
          <img src={dados.fotoUrl} alt="" style={{ width: FOTO[d], height: FOTO[d], flexShrink: 0, borderRadius: '50%', objectFit: 'cover', border: `8px solid ${corPrimaria}` }} />
        )}
        <Nome nome={dados.nome} tamanho={tamanhoNome(dados.nome) * MEDIDAS.escalaNome[d] * (dados.fotoUrl ? 1 : 1.2)} peso={600} />
        <Datas dados={dados} cor={textoSobreSecundaria} densidade={d} />
        <Filete cor={corPrimaria} />
        <Familiares dados={dados} cor={textoSobreSecundaria} densidade={d} />
        <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} densidade={d} />
      </Miolo>
      <Rodape dados={dados} cor={textoSobreSecundaria} densidade={d} />
    </div>
  );
}
