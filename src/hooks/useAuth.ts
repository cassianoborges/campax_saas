import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, setToken as storeToken, clearToken, getToken } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { UserRole, ROLE_ORDER } from './useRole';
import { EmpresaPublica, EmpresaResumo } from '@/types/empresa';
import { HOST_SLUG } from '@/lib/hostEmpresa';

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
}

/** The logged-in user, the empresa they act for (null for platform_admin or before choosing) and all their empresas. */
interface Session {
    profile: Profile;
    empresa: EmpresaPublica | null;
    empresas: EmpresaResumo[];
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
        queryFn: async (): Promise<Session | null> => {
            const { profile, empresa, empresas } = await apiClient.get<Session>('/auth/me');
            // On a funerária's subdomain only its own users have a session (spec 08): a token from
            // another empresa, a provisional one or platform_admin's (copied between addresses) is dropped.
            if (HOST_SLUG && empresa?.slug !== HOST_SLUG) {
                clearToken();
                return null;
            }
            return { profile, empresa, empresas: empresas ?? [] };
        },
        enabled: !!getToken(),
        staleTime: 5 * 60_000,
        retry: false,
    });

    const loading = !!getToken() && isLoading;

    const signIn = async (email: string, password: string) => {
        try {
            const { token, profile, empresa, empresas, escolher_empresa } = await apiClient.post<
                Session & { token: string; escolher_empresa?: boolean }
            >('/auth/login', { email, password, empresa_slug: HOST_SLUG ?? undefined });
            storeToken(token);
            queryClient.setQueryData<Session>(['profile'], { profile, empresa, empresas: empresas ?? [] });
            toast({ title: "Login realizado", description: "Bem-vindo de volta!" });
            return { data: { profile, escolherEmpresa: !!escolher_empresa }, error: null };
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

    /** Chooses (after a provisional login) or switches the empresa; drops every cached query of the previous one. */
    const trocarEmpresa = async (empresaId: string) => {
        const { token, empresa } = await apiClient.post<{ token: string; empresa: EmpresaPublica }>('/auth/empresa', { empresa_id: empresaId });
        storeToken(token);
        const atual = queryClient.getQueryData<Session>(['profile']);
        queryClient.clear();
        if (atual) queryClient.setQueryData<Session>(['profile'], { ...atual, empresa });
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
        empresas: session?.empresas ?? [],
        precisaEscolherEmpresa: !!profile && role !== 'platform_admin' && !session?.empresa,
        trocarEmpresa,
        profileLoading: false,
        role,
        isPlatformAdmin: role === 'platform_admin',
        isSuperadmin: role === 'superadmin',
        isAdmin: hasRoleAtLeast(role, 'admin'),
        isOperador: hasRoleAtLeast(role, 'operador'),
        isViewer: hasRoleAtLeast(role, 'viewer'),
    };
}
