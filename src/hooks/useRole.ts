export type UserRole = 'platform_admin' | 'superadmin' | 'admin' | 'operador' | 'viewer';

/** Roles inside an empresa — the only ones a superadmin can assign (platform_admin is never offered). */
export type TenantRole = Exclude<UserRole, 'platform_admin'>;

export const ROLE_ORDER: Record<UserRole, number> = {
    viewer: 1,
    operador: 2,
    admin: 3,
    superadmin: 4,
    platform_admin: 5,
};

/** Where a logged-in user lands: platform_admin has no empresa panel, everyone else has no platform one. */
export function homePathFor(role: UserRole | undefined) {
    return role === 'platform_admin' ? '/platform' : '/admin/dashboard';
}
