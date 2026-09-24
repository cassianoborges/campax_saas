import { useQuery, useMutation } from '@tanstack/react-query';
import { registerVisitante, getVisitantes, VisitanteFilters } from '@/services/visitantesService';
import { apiClient } from '@/lib/apiClient';

export function useVisitantes(filters?: VisitanteFilters) {
    return useQuery({
        queryKey: ['visitantes', filters],
        queryFn: () => getVisitantes(filters),
        select: (response) => response.data,
    });
}

export function useRegisterVisitante() {
    return useMutation({
        mutationFn: registerVisitante,
    });
}

export function useVisitantesPublic(velorio_id: string) {
    return useQuery({
        queryKey: ['visitantes-public', velorio_id],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: Array<{ id: string; nome: string; created_at: string }> }>(
                `/public/velorios/${velorio_id}/visitantes/nomes`
            );
            return data;
        },
        enabled: !!velorio_id,
        refetchInterval: 30_000,
    });
}
