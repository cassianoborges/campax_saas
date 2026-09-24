import { apiClient } from '@/lib/apiClient';

export interface Visitante {
    id: string;
    velorio_id: string;
    nome: string;
    celular: string;
    email: string | null;
    created_at: string;
}

export interface VisitanteFilters {
    velorioId?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
}

export async function registerVisitante(data: {
    velorio_id: string;
    nome: string;
    celular: string;
    email?: string;
}): Promise<void> {
    await apiClient.post(`/public/velorios/${data.velorio_id}/visitantes`, {
        nome: data.nome.trim(),
        celular: data.celular.trim(),
        email: data.email?.trim() || undefined,
    });
}

export async function getVisitantes(filters?: VisitanteFilters) {
    try {
        const params = new URLSearchParams();
        if (filters?.velorioId) params.set('velorioId', filters.velorioId);
        if (filters?.search) params.set('search', filters.search);
        if (filters?.startDate) params.set('startDate', filters.startDate.toISOString());
        if (filters?.endDate) params.set('endDate', filters.endDate.toISOString());

        const query = params.toString();
        const { data } = await apiClient.get<{ data: unknown[] }>(`/visitantes${query ? `?${query}` : ''}`);
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching visitantes:', error);
        return { data: null, error };
    }
}

export function downloadCSV(csvContent: string, filename: string = 'visitantes.csv') {
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

export function exportVisitantesToCSV(visitantes: any[]): string {
    if (!visitantes || visitantes.length === 0) return '';

    const headers = ['Nome', 'Celular', 'Email', 'Velório', 'Data/Hora'];

    const rows = visitantes.map((v) => [
        v.nome,
        v.celular,
        v.email || '',
        v.velorios?.nome_falecido || 'N/A',
        new Date(v.created_at).toLocaleString('pt-BR'),
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
}
