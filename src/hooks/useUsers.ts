import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Profile } from './useAuth';
import { UserRole } from './useRole';

export type ProfileRow = Profile;

export function useUsers() {
    const queryClient = useQueryClient();

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const { data } = await apiClient.get<{ data: ProfileRow[] }>('/users');
            return data;
        },
    });

    const updateRole = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
            await apiClient.patch(`/users/${userId}/role`, { role });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });

    const toggleActive = useMutation({
        mutationFn: async ({ userId, is_active }: { userId: string; is_active: boolean }) => {
            await apiClient.patch(`/users/${userId}/active`, { is_active });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const createUser = useMutation({
        mutationFn: async (input: {
            email: string;
            password: string;
            role: UserRole;
            full_name?: string;
            numero_whatsapp?: string;
            agente_ia?: boolean;
        }) => {
            const { data } = await apiClient.post<{ data: ProfileRow }>('/users', input);
            return data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });

    const updateUser = useMutation({
        mutationFn: async ({
            userId,
            ...rest
        }: {
            userId: string;
            full_name?: string;
            numero_whatsapp?: string;
            agente_ia?: boolean;
            password?: string;
        }) => {
            const { data } = await apiClient.patch<{ data: ProfileRow }>(`/users/${userId}`, rest);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    return { users, isLoading, updateRole, toggleActive, createUser, updateUser };
}
