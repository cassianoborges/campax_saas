import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/hooks/useAuth';
import { ROLE_ORDER, homePathFor } from '@/hooks/useRole';

interface ProtectedRouteProps {
    children: ReactNode;
    requiredRole?: UserRole;
    /** 'empresa' (default): a funerária's admin panel; 'platform': the platform_admin area. */
    scope?: 'empresa' | 'platform';
}

export function ProtectedRoute({ children, requiredRole, scope = 'empresa' }: ProtectedRouteProps) {
    const { user, loading, role, profileLoading } = useAuth();

    if (loading || (user && profileLoading)) {
        return (
            <div className="min-h-screen gradient-soft flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/admin" replace />;
    }

    // platform_admin outranks every company role, so the scope must be checked before the role.
    const isPlatformAdmin = role === 'platform_admin';
    if ((scope === 'empresa') === isPlatformAdmin) {
        return <Navigate to={homePathFor(role)} replace />;
    }

    if (requiredRole && (!role || ROLE_ORDER[role] < ROLE_ORDER[requiredRole])) {
        return <Navigate to={homePathFor(role)} replace />;
    }

    return <>{children}</>;
}
