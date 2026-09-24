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

/** Public per-sala link: the empresa is resolved by its public hash on the backend (404 → null). */
export function useSalaPublicLink(hashEmpresa: string | undefined, salaSlug: string | undefined) {
  return useQuery({
    queryKey: ['sala_public_link', hashEmpresa, salaSlug],
    queryFn: async (): Promise<SalaPublicLinkData | null> => {
      if (!hashEmpresa || !salaSlug) return null;
      try {
        const { data } = await apiClient.get<{ data: SalaPublicLinkData }>(
          `/public/empresas/${encodeURIComponent(hashEmpresa)}/salas/${encodeURIComponent(salaSlug)}`,
        );
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!hashEmpresa && !!salaSlug,
  });
}
