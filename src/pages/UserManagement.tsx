import { AdminLayout } from '@/components/AdminLayout';
import { CreateUserDialog } from '@/components/CreateUserDialog';
import { EditUserDialog } from '@/components/EditUserDialog';
import { useUsers, ProfileRow } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { TenantRole } from '@/hooks/useRole';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, ShieldCheck, Shield, Wrench, Eye, UserX, UserCheck, Bot, Phone } from 'lucide-react';

const ROLE_LABELS: Record<TenantRole, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    operador: 'Operador',
    viewer: 'Visualizador',
};

const ROLE_BADGE_VARIANT: Record<TenantRole, string> = {
    superadmin: 'bg-gold/20 text-gold border-gold/30',
    admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    operador: 'bg-green-500/20 text-green-400 border-green-500/30',
    viewer: 'bg-muted text-muted-foreground border-border',
};

const ROLE_ICON: Record<TenantRole, React.ElementType> = {
    superadmin: ShieldCheck,
    admin: Shield,
    operador: Wrench,
    viewer: Eye,
};

const ROLES: TenantRole[] = ['superadmin', 'admin', 'operador', 'viewer'];

export default function UserManagement() {
    const { users, isLoading, updateRole, toggleActive } = useUsers();
    const { user: currentUser } = useAuth();
    const { toast } = useToast();

    const totalAtivos = users.filter((u) => u.is_active).length;
    const countByRole = (r: TenantRole) => users.filter((u) => u.role === r).length;

    const handleRoleChange = async (userId: string, role: TenantRole) => {
        try {
            await updateRole.mutateAsync({ userId, role });
            toast({ title: 'Papel atualizado com sucesso.' });
        } catch {
            toast({ title: 'Erro ao atualizar papel', variant: 'destructive' });
        }
    };

    const handleToggleActive = async (u: ProfileRow) => {
        try {
            await toggleActive.mutateAsync({ userId: u.id, is_active: !u.is_active });
            toast({
                title: u.is_active ? 'Usuário desativado' : 'Usuário reativado',
            });
        } catch {
            toast({ title: 'Erro ao alterar status', variant: 'destructive' });
        }
    };

    return (
        <AdminLayout activeSection="usuarios">
            <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="font-heading text-3xl text-foreground mb-2">Usuários</h1>
                    <p className="text-muted-foreground">Gerencie os usuários internos do sistema</p>
                </div>
                <CreateUserDialog />
            </header>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <Card className="shadow-elegant border-gold/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-muted-foreground font-medium">Total Ativos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-heading">{totalAtivos}</div>
                    </CardContent>
                </Card>
                {ROLES.map((r) => {
                    const Icon = ROLE_ICON[r];
                    return (
                        <Card key={r} className="shadow-elegant border-gold/10">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs text-muted-foreground font-medium">
                                    {ROLE_LABELS[r]}
                                </CardTitle>
                                <Icon className="w-3 h-3 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-heading">{countByRole(r)}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Users table */}
            <Card className="shadow-elegant">
                <CardHeader>
                    <CardTitle className="font-heading text-xl flex items-center gap-2">
                        <Users className="w-5 h-5 text-gold" />
                        Lista de Usuários
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8">
                            <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                    ) : users.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado.</p>
                    ) : (
                        <div className="space-y-2">
                            {users.map((u) => {
                                const isCurrentUser = u.id === currentUser?.id;
                                const RoleIcon = ROLE_ICON[u.role as TenantRole];
                                return (
                                    <div
                                        key={u.id}
                                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border ${
                                            u.is_active
                                                ? 'bg-secondary/30 border-border'
                                                : 'bg-muted/30 border-dashed border-border opacity-60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                                                <span className="text-gold text-sm font-medium">
                                                    {(u.full_name || u.email).charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate">
                                                    {u.full_name || '—'}
                                                    {isCurrentUser && (
                                                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                                                    )}
                                                    {u.agente_ia && (
                                                        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                                            <Bot className="w-3 h-3" />
                                                            Agente IA
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                                                {u.numero_whatsapp && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        <Phone className="w-3 h-3" />
                                                        {u.numero_whatsapp}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-shrink-0 sm:ml-4">
                                            <span
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                                                    ROLE_BADGE_VARIANT[u.role as TenantRole]
                                                }`}
                                            >
                                                <RoleIcon className="w-3 h-3" />
                                                {ROLE_LABELS[u.role as TenantRole]}
                                            </span>

                                            <EditUserDialog user={u} />

                                            {!isCurrentUser && (
                                                <>
                                                    <Select
                                                        value={u.role}
                                                        onValueChange={(v) =>
                                                            handleRoleChange(u.id, v as TenantRole)
                                                        }
                                                        disabled={updateRole.isPending}
                                                    >
                                                        <SelectTrigger className="w-36 h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {ROLES.map((r) => (
                                                                <SelectItem key={r} value={r} className="text-xs">
                                                                    {ROLE_LABELS[r]}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className={
                                                                    u.is_active
                                                                        ? 'text-destructive hover:bg-destructive/10'
                                                                        : 'text-green-500 hover:bg-green-500/10'
                                                                }
                                                            >
                                                                {u.is_active ? (
                                                                    <UserX className="w-4 h-4" />
                                                                ) : (
                                                                    <UserCheck className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>
                                                                    {u.is_active
                                                                        ? 'Desativar usuário?'
                                                                        : 'Reativar usuário?'}
                                                                </AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    {u.is_active
                                                                        ? `${u.email} perderá acesso ao sistema imediatamente.`
                                                                        : `${u.email} voltará a ter acesso ao sistema.`}
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleToggleActive(u)}
                                                                    className={
                                                                        u.is_active
                                                                            ? 'bg-destructive hover:bg-destructive/90'
                                                                            : 'bg-green-600 hover:bg-green-700'
                                                                    }
                                                                >
                                                                    {u.is_active ? 'Desativar' : 'Reativar'}
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </AdminLayout>
    );
}
