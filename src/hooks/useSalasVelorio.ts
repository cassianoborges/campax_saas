import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';

export interface SalaVelorio {
    id: string;
    nome_sala_velorio: string;
    slug: string;
    endereco: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    estado: string | null;
    responsavel_sala_velorio: string | null;
    whatsapp_responsavel_sala_velorio: string | null;
    google_maps_url: string | null;
    created_at: string;
    updated_at: string;
    sala_velorio_cameras?: {
        camera_id: string;
        ordem: number;
        cameras: {
            id: string;
            nome: string;
            rtsp_url: string;
            ativo: boolean;
            webrtc_url?: string;
        };
    }[];
}

export interface SalaVelorioFormData {
    nome_sala_velorio: string;
    slug: string;
    endereco?: string | null;
    bairro?: string | null;
    cep?: string | null;
    cidade?: string | null;
    estado?: string | null;
    responsavel_sala_velorio?: string | null;
    whatsapp_responsavel_sala_velorio?: string | null;
    google_maps_url?: string | null;
    camera_ids?: string[];
}

export function useSalasVelorio() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: salas, isLoading, error } = useQuery({
        queryKey: ['salas_velorio'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: SalaVelorio[] }>('/salas');
            return data;
        },
    });

    const createSala = useMutation({
        mutationFn: async (salaData: SalaVelorioFormData) => {
            const { data } = await apiClient.post<{ data: SalaVelorio }>('/salas', salaData);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['salas_velorio'] });
            toast({
                title: "Sala criada",
                description: "Nova sala de velório adicionada com sucesso.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar sala",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const updateSala = useMutation({
        mutationFn: async ({
            id,
            data
        }: {
            id: string;
            data: Partial<SalaVelorioFormData>
        }) => {
            const { data: updated } = await apiClient.patch<{ data: SalaVelorio }>(`/salas/${id}`, data);
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['salas_velorio'] });
            queryClient.invalidateQueries({ queryKey: ['velorios'] });
            toast({
                title: "Sala atualizada",
                description: "As alterações foram salvas.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar sala",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteSala = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/salas/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['salas_velorio'] });
            toast({
                title: "Sala excluída",
                description: "A sala de velório foi removida do sistema.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao excluir sala",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return {
        salas: salas ?? [],
        isLoading,
        error,
        createSala,
        updateSala,
        deleteSala,
    };
}
