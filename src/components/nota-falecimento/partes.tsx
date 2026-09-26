import { NotaFalecimentoDados, tamanhoFamiliares } from '@/lib/notaFalecimento';
import { SERIF } from './estilos';

// Building blocks of the death-notice templates. Inline styles only: html-to-image copies computed styles,
// and inline keeps the PNG identical to the preview.

/** The funerária's logo, or its name in text when it has none (never the Campax logo). */
export function LogoOuNome({ empresa, cor, altura = 110 }: { empresa: NotaFalecimentoDados['empresa']; cor: string; altura?: number }) {
  if (empresa.logoUrl) {
    return <img src={empresa.logoUrl} alt={empresa.nome} style={{ height: altura, maxWidth: 520, objectFit: 'contain' }} />;
  }
  return <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, color: cor, letterSpacing: 1 }}>{empresa.nome}</div>;
}

export function Chamada({ cor }: { cor: string }) {
  return (
    <div style={{ fontSize: 26, letterSpacing: 8, textTransform: 'uppercase', color: cor, fontWeight: 500 }}>
      Nota de Falecimento
    </div>
  );
}

export function Datas({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.nascimento && !dados.falecimento) return null;
  return (
    <div style={{ display: 'flex', gap: 48, justifyContent: 'center', fontSize: 32, color: cor }}>
      {dados.nascimento && <span>✱ {dados.nascimento}</span>}
      {dados.falecimento && <span>✝ {dados.falecimento}</span>}
    </div>
  );
}

export function Familiares({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.familiares) return null;
  return (
    <p style={{ margin: 0, fontSize: tamanhoFamiliares(dados.familiares), lineHeight: 1.4, color: cor, fontStyle: 'italic', maxWidth: 880 }}>
      {dados.familiares}
    </p>
  );
}

function Bloco({ titulo, linhas, corTitulo, corTexto }: { titulo: string; linhas: string[]; corTitulo: string; corTexto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: corTitulo, fontWeight: 600 }}>{titulo}</div>
      {linhas.map((linha) => (
        <div key={linha} style={{ fontSize: 30, color: corTexto }}>{linha}</div>
      ))}
    </div>
  );
}

/** Velório, sepultamento and (optionally) the live stream, each as a titled block. */
export function Informacoes({ dados, corTitulo, corTexto }: { dados: NotaFalecimentoDados; corTitulo: string; corTexto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {dados.velorio && (
        <Bloco titulo="Velório" linhas={[dados.velorio.sala, dados.velorio.quando].filter(Boolean)} corTitulo={corTitulo} corTexto={corTexto} />
      )}
      {dados.sepultamento && (
        <Bloco
          titulo="Sepultamento"
          linhas={[dados.sepultamento.quando, dados.sepultamento.local].filter((l): l is string => !!l)}
          corTitulo={corTitulo}
          corTexto={corTexto}
        />
      )}
      {dados.transmissao && (
        <Bloco
          titulo="Acompanhe ao vivo"
          linhas={[`${dados.transmissao.endereco} · código ${dados.transmissao.codigo}`]}
          corTitulo={corTitulo}
          corTexto={corTexto}
        />
      )}
    </div>
  );
}

export function Rodape({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.empresa.contato) return null;
  return <div style={{ fontSize: 24, color: cor, opacity: 0.85 }}>{dados.empresa.contato}</div>;
}

/** Thin horizontal rule. */
export function Filete({ cor, largura = 160 }: { cor: string; largura?: number }) {
  return <div style={{ width: largura, height: 3, background: cor, borderRadius: 2 }} />;
}
