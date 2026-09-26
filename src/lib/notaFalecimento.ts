import { foregroundFor } from '@/lib/branding';
import { formatWhatsapp } from '@/lib/phoneMask';
import type { EmpresaPublica } from '@/types/empresa';

// Everything the death notice shows, already formatted — the templates (src/components/nota-falecimento)
// only lay it out. Pure: no DOM, no env, so it's unit-tested (notaFalecimento.test.ts).

export const FAMILIARES_MAX = 400;
/** Campax gold and navy (src/index.css --gold / --navy), for empresas without brand colors. */
export const COR_PRIMARIA_PADRAO = '#d99726';
export const COR_SECUNDARIA_PADRAO = '#212c45';

export interface NotaVelorio {
  nome_falecido: string;
  foto_falecido?: string | null;
  data_nascimento?: string | null;
  data_falecimento?: string | null;
  data_inicio: string;
  data_fim: string;
  data_sepultamento?: string | null;
  local_sepultamento?: string | null;
  familiares?: string | null;
  token_acesso: string;
  sala?: { nome_sala_velorio: string } | null;
}

export type NotaEmpresa = Pick<
  EmpresaPublica,
  'nome_exibicao' | 'slug' | 'logo_url' | 'cor_primaria' | 'cor_secundaria' | 'whatsapp_contato' | 'email_contato'
>;

export interface NotaOpcoes {
  incluirTransmissao: boolean;
  /** VITE_BASE_DOMAIN ('' = no subdomains). */
  baseDomain: string;
  /** location.host, used when there are no subdomains. */
  hostAtual: string;
}

export interface NotaFalecimentoDados {
  nome: string;
  fotoUrl: string | null;
  nascimento: string | null;
  falecimento: string | null;
  velorio: { sala: string; quando: string } | null;
  sepultamento: { quando: string | null; local: string | null } | null;
  familiares: string | null;
  transmissao: { endereco: string; codigo: string } | null;
  empresa: {
    nome: string;
    logoUrl: string | null;
    contato: string | null;
    corPrimaria: string;
    corSecundaria: string;
    textoSobrePrimaria: string;
    textoSobreSecundaria: string;
  };
}

const texto = (value: string | null | undefined) => value?.trim() || null;
const pad = (n: number) => String(n).padStart(2, '0');
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Date-only columns ("YYYY-MM-DD" or its midnight-UTC ISO): read the digits, never convert timezones. */
function dataSoDia(value: string | null | undefined): string | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

const diaMes = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const hora = (d: Date) => (d.getMinutes() ? `${d.getHours()}h${pad(d.getMinutes())}` : `${d.getHours()}h`);
const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function quandoVelorio(inicioIso: string, fimIso: string): string {
  const inicio = new Date(inicioIso);
  const fim = new Date(fimIso);
  if (mesmoDia(inicio, fim)) return `${diaMes(inicio)} (${DIAS[inicio.getDay()]}), das ${hora(inicio)} às ${hora(fim)}`;
  return `${diaMes(inicio)}, ${hora(inicio)}, a ${diaMes(fim)}, ${hora(fim)}`;
}

function quandoSepultamento(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${diaMes(d)} (${DIAS[d.getDay()]}), às ${hora(d)}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
const cor = (value: string | null, padrao: string) => (value && HEX.test(value.trim()) ? value.trim() : padrao);

export function montarNota(velorio: NotaVelorio, empresa: NotaEmpresa, opcoes: NotaOpcoes): NotaFalecimentoDados {
  const sepultamentoQuando = quandoSepultamento(velorio.data_sepultamento);
  const sepultamentoLocal = texto(velorio.local_sepultamento);
  const corPrimaria = cor(empresa.cor_primaria, COR_PRIMARIA_PADRAO);
  const corSecundaria = cor(empresa.cor_secundaria, COR_SECUNDARIA_PADRAO);
  const whatsapp = texto(empresa.whatsapp_contato);

  return {
    nome: velorio.nome_falecido.trim(),
    fotoUrl: texto(velorio.foto_falecido),
    nascimento: dataSoDia(velorio.data_nascimento),
    falecimento: dataSoDia(velorio.data_falecimento),
    velorio: { sala: velorio.sala?.nome_sala_velorio ?? '', quando: quandoVelorio(velorio.data_inicio, velorio.data_fim) },
    sepultamento: sepultamentoQuando || sepultamentoLocal ? { quando: sepultamentoQuando, local: sepultamentoLocal } : null,
    familiares: texto(velorio.familiares),
    transmissao: opcoes.incluirTransmissao
      ? { endereco: opcoes.baseDomain ? `${empresa.slug}.${opcoes.baseDomain}` : opcoes.hostAtual, codigo: velorio.token_acesso }
      : null,
    empresa: {
      nome: empresa.nome_exibicao,
      logoUrl: texto(empresa.logo_url),
      contato: whatsapp ? formatWhatsapp(whatsapp) : texto(empresa.email_contato),
      corPrimaria,
      corSecundaria,
      textoSobrePrimaria: `hsl(${foregroundFor(corPrimaria)})`,
      textoSobreSecundaria: `hsl(${foregroundFor(corSecundaria)})`,
    },
  };
}

/** Font size (px) of the deceased's name, so long names still fit in two lines. */
export function tamanhoNome(nome: string): number {
  const n = nome.trim().length;
  if (n <= 18) return 84;
  if (n <= 28) return 72;
  if (n <= 36) return 60;
  return 52;
}

/** Font size (px) of the family text (up to FAMILIARES_MAX characters). */
export function tamanhoFamiliares(value: string | null): number {
  const n = value?.length ?? 0;
  if (n <= 150) return 32;
  if (n <= 280) return 28;
  return 24;
}

export function nomeArquivoNota(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `nota-falecimento-${slug}.png` : 'nota-falecimento.png';
}
