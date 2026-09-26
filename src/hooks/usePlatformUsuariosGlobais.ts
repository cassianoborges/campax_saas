import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { TenantRole } from './useRole';

export interface EmpresaDoUsuario {
    id: string;
    nome_exibicao: string;
    slug: string;
    ativo: boolean;
}

export interface UsuarioGlobal {
    id: string;
    email: string;
    full_name: string | null;
    role: TenantRole;
    is_active: boolean;
    created_at: string;
    empresas: EmpresaDoUsuario[];
}

const KEY = ['platform', 'usuarios'] as const;

function useErrorToast() {
    const { toast } = useToast();
    return (title: string) => (error: Error) => toast({ title, description: error.message, variant: 'destructive' });
}

export function usePlatformUsuariosGlobais({ busca, empresaId }: { busca: string; empresaId: string }) {
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    if (empresaId) params.set('empresa_id', empresaId);
    const qs = params.toString();
    return useQuery({
        queryKey: [...KEY, 'lista', qs],
        queryFn: async () => (await apiClient.get<{ data: UsuarioGlobal[] }>(`/platform/usuarios${qs ? `?${qs}` : ''}`)).data,
    });
}

export function useCreateUsuarioGlobal() {
    const queryClient = useQueryClient();
    const onError = useErrorToast();
    return useMutation({
        mutationFn: async (input: { email: string; password: string; role: TenantRole; full_name?: string; empresa_ids: string[] }) =>
            (await apiClient.post<{ data: UsuarioGlobal }>('/platform/usuarios', input)).data,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: KEY });
            // Link counts in the empresa pages ("Usuários" tab, usage numbers) change too.
            queryClient.invalidateQueries({ queryKey: ['platform', 'empresas'] });
        },
        onError: onError('Erro ao criar usuário'),
    });
}

export function usePlatformUsuarioGlobal(id: string | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const onError = useErrorToast();
    const base = `/platform/usuarios/${id}`;
    const atualizar = (data?: UsuarioGlobal) => {
        if (data) queryClient.setQueryData([...KEY, id], data);
        queryClient.invalidateQueries({ queryKey: KEY });
        // Link counts in the empresa pages ("Usuários" tab, usage numbers) change too.
        queryClient.invalidateQueries({ queryKey: ['platform', 'empresas'] });
    };

    const query = useQuery({
        queryKey: [...KEY, id],
        queryFn: async () => (await apiClient.get<{ data: UsuarioGlobal }>(base)).data,
        enabled: !!id,
    });

    const update = useMutation({
        mutationFn: async (data: { full_name?: string | null; role?: TenantRole }) =>
            (await apiClient.patch<{ data: UsuarioGlobal }>(base, data)).data,
        onSuccess: (data) => {
            atualizar(data);
            toast({ title: 'Usuário atualizado' });
        },
        onError: onError('Erro ao salvar'),
    });
    const resetSenha = useMutation({
        mutationFn: (password: string) => apiClient.patch(`${base}/senha`, { password }),
        onError: onError('Erro ao redefinir a senha'),
    });
    const setAtivo = useMutation({
        mutationFn: async (is_active: boolean) => (await apiClient.patch<{ data: UsuarioGlobal }>(`${base}/ativo`, { is_active })).data,
        onSuccess: atualizar,
        onError: onError('Erro ao alterar o usuário'),
    });
    const vincular = useMutation({
        mutationFn: async (empresaId: string) => (await apiClient.put<{ data: UsuarioGlobal }>(`${base}/empresas/${empresaId}`)).data,
        onSuccess: atualizar,
        onError: onError('Erro ao vincular'),
    });
    const desvincular = useMutation({
        mutationFn: async (empresaId: string) => (await apiClient.delete<{ data: UsuarioGlobal }>(`${base}/empresas/${empresaId}`)).data,
        onSuccess: atualizar,
        onError: onError('Erro ao remover da empresa'),
    });

    return { ...query, update, resetSenha, setAtivo, vincular, desvincular };
}
