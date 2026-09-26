import type { ReactNode } from 'react';
import { Densidade, NotaFalecimentoDados, tamanhoFamiliares } from '@/lib/notaFalecimento';
import { MEDIDAS, SERIF } from './estilos';

// Building blocks of the death-notice templates. Inline styles only: html-to-image copies computed styles,
// and inline keeps the PNG identical to the preview. Images and ornaments never shrink (flexShrink: 0):
// when the text is long, the dialog picks a tighter density instead of letting flexbox squash them.

/** The funerária's logo, or its name in text when it has none (never the Campax logo). */
export function LogoOuNome({ empresa, cor, altura }: { empresa: NotaFalecimentoDados['empresa']; cor: string; altura: number }) {
  if (empresa.logoUrl) {
    return <img src={empresa.logoUrl} alt={empresa.nome} style={{ height: altura, maxWidth: 520, flexShrink: 0, objectFit: 'contain' }} />;
  }
  return <div style={{ fontFamily: SERIF, fontSize: Math.round(altura * 0.36), fontWeight: 600, color: cor, letterSpacing: 1, flexShrink: 0 }}>{empresa.nome}</div>;
}

export function Chamada({ cor, densidade }: { cor: string; densidade: Densidade }) {
  return (
    <div style={{ fontSize: MEDIDAS.chamada[densidade], letterSpacing: 8, textTransform: 'uppercase', color: cor, fontWeight: 500 }}>
      Nota de Falecimento
    </div>
  );
}

export function Nome({ nome, tamanho, peso }: { nome: string; tamanho: number; peso: number }) {
  return <div style={{ fontFamily: SERIF, fontSize: Math.round(tamanho), fontWeight: peso, lineHeight: 1.1 }}>{nome}</div>;
}

export function Datas({ dados, cor, densidade }: { dados: NotaFalecimentoDados; cor: string; densidade: Densidade }) {
  if (!dados.nascimento && !dados.falecimento) return null;
  return (
    <div style={{ display: 'flex', gap: 48, justifyContent: 'center', fontSize: MEDIDAS.datas[densidade], color: cor }}>
      {dados.nascimento && <span>✱ {dados.nascimento}</span>}
      {dados.falecimento && <span>✝ {dados.falecimento}</span>}
    </div>
  );
}

export function Familiares({ dados, cor, densidade }: { dados: NotaFalecimentoDados; cor: string; densidade: Densidade }) {
  if (!dados.familiares) return null;
  const fontSize = tamanhoFamiliares(dados.familiares) - MEDIDAS.familiaresMenos[densidade];
  return <p style={{ margin: 0, fontSize, lineHeight: 1.4, color: cor, fontStyle: 'italic', maxWidth: 880 }}>{dados.familiares}</p>;
}

function Bloco({ titulo, linhas, corTitulo, corTexto, densidade }: { titulo: string; linhas: string[]; corTitulo: string; corTexto: string; densidade: Densidade }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: MEDIDAS.blocoLinhaGap[densidade] }}>
      <div style={{ fontSize: MEDIDAS.blocoTitulo[densidade], letterSpacing: 4, textTransform: 'uppercase', color: corTitulo, fontWeight: 600 }}>{titulo}</div>
      {linhas.map((linha) => (
        <div key={linha} style={{ fontSize: MEDIDAS.blocoLinha[densidade], color: corTexto }}>{linha}</div>
      ))}
    </div>
  );
}

/** Velório, sepultamento and (optionally) the live stream, each as a titled block. */
export function Informacoes({ dados, corTitulo, corTexto, densidade }: { dados: NotaFalecimentoDados; corTitulo: string; corTexto: string; densidade: Densidade }) {
  const bloco = { corTitulo, corTexto, densidade };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: MEDIDAS.blocoGap[densidade] }}>
      {dados.velorio && <Bloco titulo="Velório" linhas={[dados.velorio.sala, dados.velorio.quando].filter(Boolean)} {...bloco} />}
      {dados.sepultamento && (
        <Bloco titulo="Sepultamento" linhas={[dados.sepultamento.quando, dados.sepultamento.local].filter((l): l is string => !!l)} {...bloco} />
      )}
      {dados.transmissao && (
        <Bloco titulo="Acompanhe ao vivo" linhas={[`${dados.transmissao.endereco} · código ${dados.transmissao.codigo}`]} {...bloco} />
      )}
    </div>
  );
}

export function Rodape({ dados, cor, densidade }: { dados: NotaFalecimentoDados; cor: string; densidade: Densidade }) {
  if (!dados.empresa.contato) return null;
  return <div style={{ fontSize: MEDIDAS.rodape[densidade], color: cor, opacity: 0.85, flexShrink: 0 }}>{dados.empresa.contato}</div>;
}

/** Thin horizontal rule. */
export function Filete({ cor, largura = 160 }: { cor: string; largura?: number }) {
  return <div style={{ width: largura, height: 3, flexShrink: 0, background: cor, borderRadius: 2 }} />;
}

/**
 * The notice's body: takes the free height between header and footer and centers its content, so a short
 * notice has no gap before the footer. Default min-height (auto): a long body grows (and the dialog then
 * picks a tighter density) instead of being clipped at the top.
 */
export function Miolo({ gap, children }: { gap: number; children: ReactNode }) {
  return (
    <div data-miolo="" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
      {children}
    </div>
  );
}
