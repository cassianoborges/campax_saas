import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getAccessLogs,
    getVelorioAccessStats,
    getOverallAccessStats,
    logVelorioAccess,
    AccessLogFilters,
} from '@/services/accessLogsService';

/**
 * Hook to fetch access logs with optional filters
 */
export function useAccessLogs(filters?: AccessLogFilters) {
    return useQuery({
        queryKey: ['accessLogs', filters],
        queryFn: () => getAccessLogs(filters),
        select: (response) => response.data,
    });
}

/**
 * Hook to fetch access logs for a specific velorio
 */
export function useVelorioAccessLogs(velorioId?: string) {
    return useQuery({
        queryKey: ['accessLogs', 'velorio', velorioId],
        queryFn: () => getAccessLogs({ velorioId }),
        select: (response) => response.data,
        enabled: !!velorioId,
    });
}

/**
 * Hook to fetch access statistics for a specific velorio
 */
export function useVelorioAccessStats(velorioId?: string) {
    return useQuery({
        queryKey: ['accessStats', 'velorio', velorioId],
        queryFn: () => getVelorioAccessStats(velorioId!),
        enabled: !!velorioId,
    });
}

/**
 * Hook to fetch overall access statistics
 */
export function useOverallAccessStats() {
    return useQuery({
        queryKey: ['accessStats', 'overall'],
        queryFn: () => getOverallAccessStats(),
    });
}

/**
 * Hook to log a new access
 */
export function useLogAccess() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            velorioId,
            token,
            ipAddress,
            userAgent,
        }: {
            velorioId: string;
            token: string;
            ipAddress?: string;
            userAgent?: string;
        }) => logVelorioAccess(velorioId, token, ipAddress, userAgent),
        onSuccess: () => {
            // Invalidate all access logs queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['accessLogs'] });
            queryClient.invalidateQueries({ queryKey: ['accessStats'] });
        },
    });
}
