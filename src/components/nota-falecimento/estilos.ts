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
