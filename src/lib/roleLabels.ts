import { TenantRole } from '@/hooks/useRole';

export const ROLE_LABELS: Record<TenantRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  operador: 'Operador',
  viewer: 'Visualizador',
};
