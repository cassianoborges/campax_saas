import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, setToken as storeToken, clearToken, getToken } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { UserRole, ROLE_ORDER } from './useRole';
import { EmpresaPublica } from '@/types/empresa';

export type { UserRole };

export interface Profile {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    is_active: boolean;
    numero_whatsapp: string | null;
    agente_ia: boolean;
    created_at: string;
    updated_at: string;
    empresa_id: string | null;
}

/** The logged-in user and their empresa (null for platform_admin). */
interface Session {
    profile: Profile;
    empresa: EmpresaPublica | null;
}

function hasRoleAtLeast(role: UserRole | undefined, required: UserRole): boolean {
    if (!role) return false;
    return ROLE_ORDER[role] >= ROLE_ORDER[required];
}

export function useAuth() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: session, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async (): Promise<Session> => {
            const { profile, empresa } = await apiClient.get<Session>('/auth/me');
            return { profile, empresa };
        },
        enabled: !!getToken(),
        staleTime: 5 * 60_000,
        retry: false,
    });

    const loading = !!getToken() && isLoading;

    const signIn = async (email: string, password: string) => {
        try {
            const { token, profile, empresa } = await apiClient.post<Session & { token: string }>('/auth/login', { email, password });
            storeToken(token);
            queryClient.setQueryData<Session>(['profile'], { profile, empresa });
            toast({ title: "Login realizado", description: "Bem-vindo de volta!" });
            return { data: { profile }, error: null };
        } catch (error) {
            const err = error as Error;
            toast({
                title: "Erro ao fazer login",
                description: err.message || "Credenciais inválidas",
                variant: "destructive",
            });
            return { data: null, error: err };
        }
    };

    const signOut = async () => {
        clearToken();
        queryClient.setQueryData(['profile'], null);
        toast({ title: "Logout realizado", description: "Até logo!" });
        return { error: null };
    };

    const profile = session?.profile;
    const role = profile?.role as UserRole | undefined;

    return {
        user: profile ?? null,
        loading,
        signIn,
        signOut,
        isAuthenticated: !!profile,
        profile: profile ?? undefined,
        empresa: session?.empresa ?? null,
        profileLoading: false,
        role,
        isPlatformAdmin: role === 'platform_admin',
        isSuperadmin: role === 'superadmin',
        isAdmin: hasRoleAtLeast(role, 'admin'),
        isOperador: hasRoleAtLeast(role, 'operador'),
        isViewer: hasRoleAtLeast(role, 'viewer'),
    };
}
