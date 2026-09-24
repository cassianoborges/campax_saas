import { apiClient } from '@/lib/apiClient';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_TEXT } from '@/config/terms';
import { sha256Hex } from '@/lib/hash';

export interface RecordTermsAcceptanceInput {
    velorio_id: string;
    nome: string;
    celular: string;
    email?: string;
    ip_address?: string;
    user_agent?: string;
}

/**
 * Log de Aceite de Termos de Uso — Campax
 *
 * Este registro serve como prova jurídica do consentimento do usuário, nos
 * termos do Código Civil (art. 107), do Marco Civil da Internet (art. 7º) e
 * da LGPD (art. 8º). A tabela terms_acceptances é append-only: esta camada
 * de serviço nunca deve ganhar uma função de update ou delete.
 */

// Acceptance is per funerária (each one is the data controller for its visitors), so the check
// takes the velório the visitor is entering and the backend derives the empresa from it.
export async function hasAcceptedCurrentTerms(celular: string, velorioId: string): Promise<boolean> {
    const params = new URLSearchParams({ celular: celular.trim(), version: CURRENT_TERMS_VERSION, velorio_id: velorioId });
    const { accepted } = await apiClient.get<{ accepted: boolean }>(`/public/terms/accepted?${params}`);
    return Boolean(accepted);
}

export async function recordTermsAcceptance(input: RecordTermsAcceptanceInput): Promise<void> {
    const documentHash = await sha256Hex(CURRENT_TERMS_TEXT);

    await apiClient.post('/public/terms-acceptances', {
        velorio_id: input.velorio_id,
        nome: input.nome.trim(),
        celular: input.celular.trim(),
        email: input.email?.trim() || undefined,
        terms_version: CURRENT_TERMS_VERSION,
        document_hash: documentHash,
    });
}
