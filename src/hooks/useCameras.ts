import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';

export interface Camera {
    id: string;
    nome: string;
    rtsp_url: string;
    ativo: boolean;
    mediamtx_path?: string | null;
    webrtc_url?: string | null;
    status?: string; // 'online' | 'offline' | 'unknown'
    /** When the backend last checked the camera (POST /cameras/check-status). */
    status_checked_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface CameraFormData {
    nome: string;
    rtsp_url: string;
    ativo?: boolean;
    status?: string;
}

export function useCameras() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Fetch all cameras
    const { data: cameras, isLoading, error } = useQuery({
        queryKey: ['cameras'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: Camera[] }>('/cameras');
            return data;
        },
    });

    // Fetch active cameras only (for public access)
    const { data: activeCameras } = useQuery({
        queryKey: ['cameras', 'active'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: Camera[] }>('/cameras?ativo=true');
            return data;
        },
    });

    // Create camera
    const createCamera = useMutation({
        mutationFn: async (cameraData: CameraFormData) => {
            const { data } = await apiClient.post<{ data: Camera }>('/cameras', cameraData);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cameras'] });
            toast({
                title: "Câmera criada",
                description: "Nova câmera adicionada com sucesso.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar câmera",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Update camera
    const updateCamera = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<CameraFormData> }) => {
            const { data: updated } = await apiClient.patch<{ data: Camera }>(`/cameras/${id}`, data);
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cameras'] });
            toast({
                title: "Câmera atualizada",
                description: "As alterações foram salvas.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar câmera",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Delete camera
    const deleteCamera = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/cameras/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cameras'] });
            toast({
                title: "Câmera excluída",
                description: "A câmera foi removida do sistema.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao excluir câmera",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return {
        cameras: cameras ?? [],
        activeCameras: activeCameras ?? [],
        isLoading,
        error,
        createCamera,
        updateCamera,
        deleteCamera,
    };
}
