import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { MEDIDAS, raiz } from './estilos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, Miolo, Nome, Rodape } from './partes';

const FUNDO = '#FAF7F2';
const TEXTO = '#1F2937';
const FOTO = [
  { width: 300, height: 360 },
  { width: 220, height: 264 },
  { width: 160, height: 192 },
];
const RAMOS = [60, 46, 34];

/** Discreet olive branches, drawn inline so the export needs no extra file. */
function Ramos({ cor, altura, invertido = false }: { cor: string; altura: number; invertido?: boolean }) {
  return (
    <svg width={altura * 6} height={altura} viewBox="0 0 360 60" style={{ flexShrink: 0, transform: invertido ? 'scaleY(-1)' : undefined }} aria-hidden>
      <path d="M10 30 H350" stroke={cor} strokeWidth="2" fill="none" />
      {[60, 110, 160, 200, 250, 300].map((x, i) => (
        <ellipse key={x} cx={x} cy={i % 2 ? 20 : 40} rx="16" ry="7" fill={cor} opacity="0.7" transform={`rotate(${i % 2 ? -25 : 25} ${x} ${i % 2 ? 20 : 40})`} />
      ))}
    </svg>
  );
}

/** Light background, dark text, thin-framed photo, olive branches. */
export function ModeloSereno({ dados, densidade = 0 }: ModeloProps) {
  const { corPrimaria } = dados.empresa;
  const d = densidade;
  const gap = MEDIDAS.gap[d];
  return (
    <div style={{ ...raiz, background: FUNDO, color: TEXTO, padding: `${[56, 44, 36][d]}px 90px ${[48, 40, 32][d]}px`, gap: [24, 16, 10][d] }}>
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={MEDIDAS.logo[d] - 10} />
      <Ramos cor={corPrimaria} altura={RAMOS[d]} />
      <Miolo gap={gap}>
        <Chamada cor={corPrimaria} densidade={d} />
        {dados.fotoUrl && (
          <img src={dados.fotoUrl} alt="" style={{ ...FOTO[d], flexShrink: 0, objectFit: 'cover', borderRadius: 16, border: `3px solid ${corPrimaria}`, padding: 8, background: '#fff' }} />
        )}
        <Nome nome={dados.nome} tamanho={tamanhoNome(dados.nome) * MEDIDAS.escalaNome[d] * (dados.fotoUrl ? 1 : 1.2)} peso={500} />
        <Datas dados={dados} cor={TEXTO} densidade={d} />
        <Familiares dados={dados} cor={TEXTO} densidade={d} />
        <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={TEXTO} densidade={d} />
      </Miolo>
      <Ramos cor={corPrimaria} altura={RAMOS[d]} invertido />
      <Rodape dados={dados} cor={TEXTO} densidade={d} />
    </div>
  );
}
