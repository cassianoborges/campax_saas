import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { raiz, SERIF } from './estilos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, Rodape } from './partes';

const FUNDO = '#FAF7F2';
const TEXTO = '#1F2937';

/** Discreet olive branches, drawn inline so the export needs no extra file. */
function Ramos({ cor, invertido = false }: { cor: string; invertido?: boolean }) {
  return (
    <svg width="360" height="60" viewBox="0 0 360 60" style={{ transform: invertido ? 'scaleY(-1)' : undefined }} aria-hidden>
      <path d="M10 30 H350" stroke={cor} strokeWidth="2" fill="none" />
      {[60, 110, 160, 200, 250, 300].map((x, i) => (
        <ellipse key={x} cx={x} cy={i % 2 ? 20 : 40} rx="16" ry="7" fill={cor} opacity="0.7" transform={`rotate(${i % 2 ? -25 : 25} ${x} ${i % 2 ? 20 : 40})`} />
      ))}
    </svg>
  );
}

/** Light background, dark text, thin-framed photo, olive branches. */
export function ModeloSereno({ dados }: ModeloProps) {
  const { corPrimaria } = dados.empresa;
  const semFoto = !dados.fotoUrl;
  return (
    <div style={{ ...raiz, background: FUNDO, color: TEXTO, padding: '56px 90px', gap: 24, justifyContent: semFoto ? 'center' : 'flex-start' }}>
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={100} />
      <Ramos cor={corPrimaria} />
      <Chamada cor={corPrimaria} />
      {dados.fotoUrl && (
        <img src={dados.fotoUrl} alt="" style={{ width: 300, height: 360, objectFit: 'cover', borderRadius: 16, border: `3px solid ${corPrimaria}`, padding: 8, background: '#fff' }} />
      )}
      <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (semFoto ? 1.2 : 1), fontWeight: 500, lineHeight: 1.1 }}>{dados.nome}</div>
      <Datas dados={dados} cor={TEXTO} />
      <Familiares dados={dados} cor={TEXTO} />
      <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={TEXTO} />
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Ramos cor={corPrimaria} invertido />
        <Rodape dados={dados} cor={TEXTO} />
      </div>
    </div>
  );
}
