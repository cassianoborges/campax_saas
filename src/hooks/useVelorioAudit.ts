import { useQuery } from '@tanstack/react-query';
import {
    getVeloriosWithCreator,
    getVelorioCreationStats,
    VelorioAuditFilters,
} from '@/services/velorioAuditService';

/**
 * Hook to fetch velorios with creator information
 */
export function useVelorioAudit(filters?: VelorioAuditFilters) {
    return useQuery({
        queryKey: ['velorioAudit', filters],
        queryFn: () => getVeloriosWithCreator(filters),
        select: (response) => response.data,
    });
}

/**
 * Hook to fetch velorio creation statistics
 */
export function useVelorioCreationStats() {
    return useQuery({
        queryKey: ['velorioCreationStats'],
        queryFn: () => getVelorioCreationStats(),
    });
}
