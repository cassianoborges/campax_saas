import { apiClient } from '@/lib/apiClient';

export interface AccessLog {
    id: string;
    velorio_id: string;
    token_acesso: string;
    accessed_at: string;
    ip_address?: string;
    user_agent?: string;
    session_duration?: string;
    nome_visitante?: string;
    celular_visitante?: string;
    email_visitante?: string;
    created_at: string;
}

export interface AccessStats {
    total_accesses: number;
    unique_tokens: number;
    last_access: string | null;
    accesses_last_24h: number;
}

export interface OverallStats {
    total_accesses: number;
    total_velorios: number;
    accesses_today: number;
    accesses_last_7_days: number;
}

export interface AccessLogFilters {
    velorioId?: string;
    startDate?: Date;
    endDate?: Date;
    token?: string;
}

/**
 * Log a new access to a velorio
 */
export async function logVelorioAccess(
    velorioId: string,
    token: string,
    ipAddress?: string,
    userAgent?: string,
    visitante?: { nome: string; celular: string; email?: string }
) {
    try {
        await apiClient.post(`/public/velorios/${velorioId}/access-logs`, {
            token,
            nome_visitante: visitante?.nome ?? null,
            celular_visitante: visitante?.celular ?? null,
            email_visitante: visitante?.email ?? null,
        });
        return { error: null };
    } catch (error) {
        console.error('Error logging velorio access:', error);
        return { error };
    }
}

/**
 * Get access logs with optional filters
 */
export async function getAccessLogs(filters?: AccessLogFilters) {
    try {
        const params = new URLSearchParams();
        if (filters?.velorioId) params.set('velorioId', filters.velorioId);
        if (filters?.token) params.set('token', filters.token);
        if (filters?.startDate) params.set('startDate', filters.startDate.toISOString());
        if (filters?.endDate) params.set('endDate', filters.endDate.toISOString());

        const query = params.toString();
        const { data } = await apiClient.get<{ data: unknown[] }>(`/access-logs${query ? `?${query}` : ''}`);
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching access logs:', error);
        return { data: null, error };
    }
}

/**
 * Get access statistics for a specific velorio
 */
export async function getVelorioAccessStats(velorioId: string): Promise<AccessStats | null> {
    try {
        const { data } = await apiClient.get<{ data: AccessStats }>(`/velorios/${velorioId}/access-stats`);
        return data;
    } catch (error) {
        console.error('Error fetching velorio access stats:', error);
        return null;
    }
}

/**
 * Get overall access statistics
 */
export async function getOverallAccessStats(): Promise<OverallStats | null> {
    try {
        const { data } = await apiClient.get<{ data: OverallStats }>('/access-stats/overall');
        return data;
    } catch (error) {
        console.error('Error fetching overall access stats:', error);
        return null;
    }
}

/**
 * Export access logs to CSV format
 */
export function exportAccessLogsToCSV(logs: any[]): string {
    if (!logs || logs.length === 0) return '';

    const headers = [
        'Data/Hora',
        'Falecido',
        'Sala',
        'Token',
        'Visitante',
        'Celular',
        'E-mail',
        'IP',
        'Dispositivo',
    ];

    const rows = logs.map((log) => [
        new Date(log.accessed_at).toLocaleString('pt-BR'),
        log.velorios?.nome_falecido || 'N/A',
        log.velorios?.sala?.nome_sala_velorio || 'N/A',
        log.token_acesso,
        log.nome_visitante || 'N/A',
        log.celular_visitante || 'N/A',
        log.email_visitante || '',
        log.ip_address || 'N/A',
        log.user_agent || 'N/A',
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string = 'relatorio-acessos.csv') {
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Get user agent information (browser/device)
 */
export function getUserAgent(): string {
    return navigator.userAgent;
}

/**
 * IP address is now captured server-side (from the request) when logging access —
 * see POST /public/velorios/:id/access-logs on the backend.
 */
export async function getClientIP(): Promise<string | null> {
    return null;
}
