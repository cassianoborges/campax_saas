import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError, getToken } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { EmpresaPublica } from '@/types/empresa';

export type VelorioStatus = 'Agendado' | 'Ao Vivo' | 'Encerrado';

export interface Velorio {
    id: string;
    /** Present in the public endpoints' responses (the funerária's branding). */
    empresa?: EmpresaPublica;
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    token_acesso: string;
    sala_velorio_id: string;
    status: VelorioStatus;
    responsavel_velorio_nome?: string | null;
    contato_whatsapp_responsavel?: string | null;
    data_nascimento?: string | null;
    data_falecimento?: string | null;
    mensagem_homenagem?: string | null;
    foto_falecido?: string | null;
    data_sepultamento?: string | null;
    local_sepultamento?: string | null;
    google_maps_url_sepultamento?: string | null;
    created_at: string;
    updated_at: string;
    sala?: {
        id: string;
        nome_sala_velorio: string;
        endereco?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        cep?: string | null;
        google_maps_url?: string | null;
        sala_velorio_cameras?: {
            camera_id: string;
            ordem: number;
            cameras: {
                id: string;
                nome: string;
                rtsp_url?: string; // omitted by the public endpoints
                ativo: boolean;
                webrtc_url?: string;
                /** Public endpoints only: reader URL with a token for this velório (MediaMTX denies reads without one). */
                stream_url?: string | null;
            };
        }[];
    };
}

export interface VelorioFormData {
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    sala_velorio_id: string;
    status?: VelorioStatus;
    responsavel_velorio_nome?: string;
    contato_whatsapp_responsavel?: string;
    data_nascimento?: string;
    data_falecimento?: string;
    mensagem_homenagem?: string;
    foto_falecido?: string;
    data_sepultamento?: string;
    local_sepultamento?: string;
    google_maps_url_sepultamento?: string;
}

export function useVelorios() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Fetch all velorios with sala and cameras
    const { data: velorios, isLoading, error } = useQuery({
        queryKey: ['velorios'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: Velorio[] }>('/velorios');
            return data;
        },
        // Public pages use this hook for useVelorio/useVelorioByToken; visitors have no token,
        // so the (authenticated) list must not be fetched for them.
        enabled: !!getToken(),
    });

    // Fetch single velorio by ID (public endpoint, no auth required — used by the viewing page)
    const useVelorio = (id: string | undefined) => {
        return useQuery({
            queryKey: ['velorios', 'public', id],
            queryFn: async () => {
                if (!id) return null;
                try {
                    const { data } = await apiClient.get<{ data: Velorio }>(`/public/velorios/id/${id}`);
                    return data;
                } catch (error) {
                    if (error instanceof ApiError && error.status === 404) return null;
                    throw error;
                }
            },
            enabled: !!id,
        });
    };

    // Fetch velorio by token (public endpoint, no auth required)
    const useVelorioByToken = (token: string | undefined) => {
        return useQuery({
            queryKey: ['velorios', 'token', token],
            queryFn: async () => {
                if (!token || token.length !== 6) return null;
                try {
                    const { data } = await apiClient.get<{ data: Velorio }>(`/public/velorios/${token.toUpperCase()}`);
                    return data;
                } catch (error) {
                    if (error instanceof ApiError && error.status === 404) return null;
                    throw error;
                }
            },
            enabled: !!token && token.length === 6,
        });
    };

    // Create velorio
    const createVelorio = useMutation({
        mutationFn: async (velorioData: VelorioFormData) => {
            const { data } = await apiClient.post<{ data: Velorio }>('/velorios', velorioData);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['velorios'] });
            toast({
                title: "Velório criado",
                description: "Novo velório adicionado com sucesso.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar velório",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Update velorio
    const updateVelorio = useMutation({
        mutationFn: async ({
            id,
            data
        }: {
            id: string;
            data: Partial<VelorioFormData>
        }) => {
            const { data: updated } = await apiClient.patch<{ data: Velorio }>(`/velorios/${id}`, data);
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['velorios'] });
            toast({
                title: "Velório atualizado",
                description: "As alterações foram salvas.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar velório",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Delete velorio
    const deleteVelorio = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/velorios/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['velorios'] });
            toast({
                title: "Velório excluído",
                description: "O velório foi removido do sistema.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao excluir velório",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return {
        velorios: velorios ?? [],
        isLoading,
        error,
        useVelorio,
        useVelorioByToken,
        createVelorio,
        updateVelorio,
        deleteVelorio,
    };
}

// Helper function to get velorio status based on dates
export function getVelorioStatus(velorio: Velorio): VelorioStatus {
    const now = new Date();
    const dataInicio = new Date(velorio.data_inicio);
    const dataFim = new Date(velorio.data_fim);

    if (now < dataInicio) return 'Agendado';
    if (now > dataFim) return 'Encerrado';
    return 'Ao Vivo';
}
