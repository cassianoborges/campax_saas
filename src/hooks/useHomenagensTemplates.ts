import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';

export interface HomenagemTemplate {
    id: string;
    titulo: string;
    mensagem: string;
    /** null = global template maintained by the platform (read-only for the funerária). */
    empresa_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface HomenagemTemplateFormData {
    titulo: string;
    mensagem: string;
}

export function useHomenagensTemplates() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: templates, isLoading, error } = useQuery({
        queryKey: ['homenagens_templates'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: HomenagemTemplate[] }>('/homenagens-templates');
            return data;
        },
    });

    const createTemplate = useMutation({
        mutationFn: async (formData: HomenagemTemplateFormData) => {
            const { data } = await apiClient.post<{ data: HomenagemTemplate }>('/homenagens-templates', formData);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem criada",
                description: "Nova mensagem adicionada ao banco de homenagens.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const updateTemplate = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: HomenagemTemplateFormData }) => {
            const { data: updated } = await apiClient.patch<{ data: HomenagemTemplate }>(`/homenagens-templates/${id}`, data);
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem atualizada",
                description: "As alterações foram salvas.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteTemplate = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/homenagens-templates/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem excluída",
                description: "A mensagem foi removida do banco de homenagens.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao excluir mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return {
        templates: templates ?? [],
        isLoading,
        error,
        createTemplate,
        updateTemplate,
        deleteTemplate,
    };
}
