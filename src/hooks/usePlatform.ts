import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { TenantRole } from './useRole';

// Platform panel (platform_admin only) — /platform/* on the backend.

export interface EmpresaUso {
    usuarios: number;
    cameras: number;
    salas: number;
    velorios: number;
    velorios_ao_vivo: number;
    acessos_30d: number;
}

export interface EmpresaPlataforma {
    id: string;
    nome: string;
    nome_exibicao: string;
    slug: string;
    hash_publico: string;
    cnpj: string | null;
    logo_url: string | null;
    cor_primaria: string | null;
    cor_secundaria: string | null;
    whatsapp_contato: string | null;
    email_contato: string | null;
    ativo: boolean;
    created_at: string;
    uso: EmpresaUso;
}

export type EmpresaEditavel = Partial<
    Pick<EmpresaPlataforma, 'nome' | 'nome_exibicao' | 'cnpj' | 'whatsapp_contato' | 'email_contato' | 'cor_primaria' | 'cor_secundaria'>
>;

export interface NovaEmpresaInput {
    empresa: EmpresaEditavel & { nome: string; nome_exibicao: string; slug?: string };
    superadmin: { email: string; password: string; full_name?: string };
}

export interface UsuarioEmpresa {
    id: string;
    email: string;
    full_name: string | null;
    role: TenantRole;
    is_active: boolean;
    created_at: string;
}

export interface ModeloGlobal {
    id: string;
    titulo: string;
    mensagem: string;
}

const KEYS = {
    empresas: ['platform', 'empresas'] as const,
    empresa: (id: string) => ['platform', 'empresas', id] as const,
    usuarios: (id: string) => ['platform', 'empresas', id, 'usuarios'] as const,
    modelos: ['platform', 'modelos'] as const,
};

function useErrorToast() {
    const { toast } = useToast();
    return (title: string) => (error: Error) => toast({ title, description: error.message, variant: 'destructive' });
}

export function usePlatformEmpresas() {
    return useQuery({
        queryKey: KEYS.empresas,
        queryFn: async () => (await apiClient.get<{ data: EmpresaPlataforma[] }>('/platform/empresas')).data,
    });
}

export function usePlatformEmpresa(id: string | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const onError = useErrorToast();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: KEYS.empresas });

    const query = useQuery({
        queryKey: KEYS.empresa(id ?? ''),
        queryFn: async () => (await apiClient.get<{ data: EmpresaPlataforma }>(`/platform/empresas/${id}`)).data,
        enabled: !!id,
    });

    const update = useMutation({
        mutationFn: (data: EmpresaEditavel) => apiClient.patch(`/platform/empresas/${id}`, data),
        onSuccess: () => {
            invalidate();
            toast({ title: 'Empresa atualizada' });
        },
        onError: onError('Erro ao salvar'),
    });

    const setAtivo = useMutation({
        mutationFn: (ativo: boolean) => apiClient.patch(`/platform/empresas/${id}/ativo`, { ativo }),
        onSuccess: (_data, ativo) => {
            invalidate();
            toast({ title: ativo ? 'Empresa reativada' : 'Empresa suspensa' });
        },
        onError: onError('Erro ao alterar o status'),
    });

    const uploadLogo = useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return apiClient.post(`/platform/empresas/${id}/logo`, form);
        },
        onSuccess: () => {
            invalidate();
            toast({ title: 'Logo atualizado' });
        },
        onError: onError('Erro ao enviar o logo'),
    });

    const removeLogo = useMutation({
        mutationFn: () => apiClient.delete(`/platform/empresas/${id}/logo`),
        onSuccess: invalidate,
        onError: onError('Erro ao remover o logo'),
    });

    return { ...query, update, setAtivo, uploadLogo, removeLogo };
}

export function useCreateEmpresa() {
    const queryClient = useQueryClient();
    const onError = useErrorToast();
    return useMutation({
        mutationFn: async (input: NovaEmpresaInput) =>
            (await apiClient.post<{ data: EmpresaPlataforma }>('/platform/empresas', input)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.empresas }),
        onError: onError('Erro ao criar empresa'),
    });
}

export function usePlatformUsuarios(empresaId: string | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const onError = useErrorToast();
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: KEYS.usuarios(empresaId ?? '') });
        queryClient.invalidateQueries({ queryKey: KEYS.empresas });
    };
    const base = `/platform/empresas/${empresaId}/usuarios`;

    const query = useQuery({
        queryKey: KEYS.usuarios(empresaId ?? ''),
        queryFn: async () => (await apiClient.get<{ data: UsuarioEmpresa[] }>(base)).data,
        enabled: !!empresaId,
    });

    const create = useMutation({
        mutationFn: (input: { email: string; password: string; role: TenantRole; full_name?: string }) => apiClient.post(base, input),
        onSuccess: () => {
            invalidate();
            toast({ title: 'Usuário criado' });
        },
        onError: onError('Erro ao criar usuário'),
    });

    const resetSenha = useMutation({
        mutationFn: ({ userId, password }: { userId: string; password: string }) =>
            apiClient.patch(`${base}/${userId}/senha`, { password }),
        onError: onError('Erro ao redefinir a senha'),
    });

    const setAtivo = useMutation({
        mutationFn: ({ userId, is_active }: { userId: string; is_active: boolean }) =>
            apiClient.patch(`${base}/${userId}/ativo`, { is_active }),
        onSuccess: invalidate,
        onError: onError('Erro ao alterar o usuário'),
    });

    return { ...query, create, resetSenha, setAtivo };
}

export function usePlatformModelos() {
    const queryClient = useQueryClient();
    const onError = useErrorToast();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: KEYS.modelos });

    const query = useQuery({
        queryKey: KEYS.modelos,
        queryFn: async () => (await apiClient.get<{ data: ModeloGlobal[] }>('/platform/homenagens-templates')).data,
    });
    const create = useMutation({
        mutationFn: (data: Omit<ModeloGlobal, 'id'>) => apiClient.post('/platform/homenagens-templates', data),
        onSuccess: invalidate,
        onError: onError('Erro ao salvar o modelo'),
    });
    const update = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Omit<ModeloGlobal, 'id'> }) =>
            apiClient.patch(`/platform/homenagens-templates/${id}`, data),
        onSuccess: invalidate,
        onError: onError('Erro ao salvar o modelo'),
    });
    const remove = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/platform/homenagens-templates/${id}`),
        onSuccess: invalidate,
        onError: onError('Erro ao excluir o modelo'),
    });
    return { ...query, create, update, remove };
}
