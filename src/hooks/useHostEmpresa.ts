import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/apiClient';
import { HOST_SLUG } from '@/lib/hostEmpresa';
import { EmpresaPublica } from '@/types/empresa';

/** Branding of the funerária this address belongs to (spec 08). slug null = generic address. */
export function useHostEmpresa() {
  const query = useQuery({
    queryKey: ['host_empresa', HOST_SLUG],
    queryFn: async (): Promise<EmpresaPublica | null> => {
      try {
        const { data } = await apiClient.get<{ data: EmpresaPublica }>(`/public/empresas/slug/${encodeURIComponent(HOST_SLUG!)}`);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!HOST_SLUG,
    staleTime: 10 * 60_000,
  });
  return {
    slug: HOST_SLUG,
    empresa: query.data ?? null,
    isLoading: !!HOST_SLUG && query.isLoading,
    notFound: !!HOST_SLUG && query.isSuccess && query.data === null,
  };
}
