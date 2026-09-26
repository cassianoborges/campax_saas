import type { CSSProperties } from 'react';
import { ALTURA_NOTA, LARGURA_NOTA } from '@/lib/imagemNota';

// Shared styles of the death-notice templates (kept apart from partes.tsx so that file only exports components).

export const SERIF = "'Playfair Display', serif";
export const SANS = 'Inter, sans-serif';

export const raiz: CSSProperties = {
  width: LARGURA_NOTA,
  height: ALTURA_NOTA,
  overflow: 'hidden',
  position: 'relative',
  boxSizing: 'border-box',
  fontFamily: SANS,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
};

/**
 * Sizes shared by the templates, per density level (index = Densidade: 0 regular … 2 tightest). The dialog
 * measures the notice and uses the first level that fits 1350 px.
 */
export const MEDIDAS = {
  gap: [26, 18, 10],
  logo: [110, 88, 64],
  chamada: [26, 24, 20],
  datas: [32, 30, 26],
  escalaNome: [1, 0.92, 0.8],
  familiaresMenos: [0, 2, 4],
  blocoGap: [26, 14, 8],
  blocoTitulo: [22, 20, 18],
  blocoLinha: [30, 27, 24],
  blocoLinhaGap: [6, 2, 0],
  rodape: [24, 22, 20],
} as const;
