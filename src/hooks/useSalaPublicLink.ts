import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/apiClient';
import { EmpresaPublica } from '@/types/empresa';

export interface SalaPublicLinkVelorio {
  id: string;
  nome_falecido: string;
  data_inicio: string;
  data_fim: string;
  data_sepultamento: string | null;
}

export interface SalaPublicLinkData {
  sala: {
    id: string;
    nome_sala_velorio: string;
    cidade: string | null;
    estado: string | null;
  };
  atual: SalaPublicLinkVelorio | null;
  proximo: SalaPublicLinkVelorio | null;
  empresa: EmpresaPublica;
}

export type EmpresaRef = { hash: string } | { slug: string };

/** Public per-sala link: the empresa by its public hash (/:hash/:sala) or its subdomain slug (/:sala). 404 → null. */
export function useSalaPublicLink(empresaRef: EmpresaRef | null, salaSlug: string | undefined) {
  const prefix = !empresaRef
    ? null
    : 'hash' in empresaRef
      ? `/public/empresas/${encodeURIComponent(empresaRef.hash)}`
      : `/public/empresas/slug/${encodeURIComponent(empresaRef.slug)}`;
  return useQuery({
    queryKey: ['sala_public_link', prefix, salaSlug],
    queryFn: async (): Promise<SalaPublicLinkData | null> => {
      try {
        const { data } = await apiClient.get<{ data: SalaPublicLinkData }>(`${prefix}/salas/${encodeURIComponent(salaSlug!)}`);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!prefix && !!salaSlug,
  });
}
