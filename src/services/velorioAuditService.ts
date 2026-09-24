import { apiClient } from '@/lib/apiClient';

export interface VelorioAuditRecord {
    id: string;
    nome_falecido: string;
    sala_velorio: string;
    token_acesso: string;
    status: string;
    created_at: string;
    created_by: string | null;
    created_by_email?: string;
    data_inicio: string;
    data_fim: string;
}

export interface VelorioCreationStats {
    total_velorios: number;
    velorios_today: number;
    velorios_this_week: number;
    velorios_this_month: number;
}

export interface VelorioAuditFilters {
    startDate?: Date;
    endDate?: Date;
    createdBy?: string;
    sala?: string;
}

interface VelorioAuditApiRow {
    created_by: string | null;
    created_by_name?: string | null;
    created_by_email?: string | null;
    [key: string]: unknown;
}

/**
 * Get all velorios with creator information
 */
export async function getVeloriosWithCreator(filters?: VelorioAuditFilters) {
    try {
        const params = new URLSearchParams();
        if (filters?.startDate) params.set('dateFrom', filters.startDate.toISOString());
        if (filters?.endDate) params.set('dateTo', filters.endDate.toISOString());
        if (filters?.createdBy) params.set('createdBy', filters.createdBy);
        if (filters?.sala) params.set('sala', filters.sala);

        const query = params.toString();
        const { data } = await apiClient.get<{ data: VelorioAuditApiRow[] }>(`/velorios/audit${query ? `?${query}` : ''}`);

        const transformedData = data?.map((velorio) => ({
            ...velorio,
            created_by_email: velorio.created_by
                ? (velorio.created_by_name || velorio.created_by_email || 'Usuário')
                : 'Sistema',
        }));

        return { data: transformedData, error: null };
    } catch (error) {
        console.error('Error fetching velorios with creator:', error);
        return { data: null, error };
    }
}

/**
 * Get velorio creation statistics
 */
export async function getVelorioCreationStats(): Promise<VelorioCreationStats | null> {
    try {
        const { data } = await apiClient.get<{ data: VelorioCreationStats }>('/velorios/creation-stats');
        return data;
    } catch (error) {
        console.error('Error fetching velorio creation stats:', error);
        return null;
    }
}

/**
 * Export velorio audit to CSV
 */
export function exportVelorioAuditToCSV(velorios: any[]): string {
    if (!velorios || velorios.length === 0) return '';

    const headers = [
        'Data/Hora Criação',
        'Falecido',
        'Sala',
        'Token',
        'Status',
        'Criado Por',
        'Início Velório',
        'Fim Velório',
    ];

    const rows = velorios.map((velorio) => [
        new Date(velorio.created_at).toLocaleString('pt-BR'),
        velorio.nome_falecido,
        velorio.sala?.nome_sala_velorio || '',
        velorio.token_acesso,
        velorio.status,
        velorio.created_by_email || 'Sistema',
        new Date(velorio.data_inicio).toLocaleString('pt-BR'),
        new Date(velorio.data_fim).toLocaleString('pt-BR'),
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
export function downloadVelorioAuditCSV(csvContent: string, filename: string = 'relatorio-velorios.csv') {
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
