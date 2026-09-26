import type { Densidade, NotaFalecimentoDados } from '@/lib/notaFalecimento';
import { ModeloClassico } from './ModeloClassico';
import { ModeloModerno } from './ModeloModerno';
import { ModeloSereno } from './ModeloSereno';

// The death-notice templates. A new template = one component (1080×1350, see partes.tsx) + one entry here.

export interface ModeloProps {
  dados: NotaFalecimentoDados;
  /** Layout tightness, chosen by the dialog so the notice fits 1350 px (default 0 = regular). */
  densidade?: Densidade;
}

export type ModeloNotaId = 'classico' | 'sereno' | 'moderno';

export interface ModeloNota {
  id: ModeloNotaId;
  nome: string;
  componente: (props: ModeloProps) => JSX.Element;
}

export const MODELOS_NOTA: ModeloNota[] = [
  { id: 'classico', nome: 'Clássico', componente: ModeloClassico },
  { id: 'sereno', nome: 'Sereno', componente: ModeloSereno },
  { id: 'moderno', nome: 'Moderno', componente: ModeloModerno },
];

export function modeloPorId(id: string | null): ModeloNota {
  return MODELOS_NOTA.find((m) => m.id === id) ?? MODELOS_NOTA[0];
}
