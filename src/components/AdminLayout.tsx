import { ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { EmpresaLogo } from '@/components/EmpresaLogo';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
    LayoutDashboard,
    Building2,
    Camera,
    Calendar,
    LogOut,
    FileText,
    UserCog,
    Settings,
    Menu,
    ChevronDown,
    MessageSquareHeart,
} from 'lucide-react';

type ActiveSection = 'dashboard' | 'salas' | 'velorios' | 'cameras' | 'relatorios' | 'usuarios' | 'configuracoes';

interface AdminLayoutProps {
    children: ReactNode;
    activeSection: ActiveSection;
}

export function AdminLayout({ children, activeSection }: AdminLayoutProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { signOut, isSuperadmin, isAdmin, empresa } = useAuth();
    // B1: the admin panel shows the funerária's logo and name, but keeps the Campax colors.
    const nomePainel = empresa?.nome_exibicao ?? 'Velório Online';
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(activeSection === 'configuracoes');

    const handleLogout = async () => {
        await signOut();
        navigate('/admin');
    };

    const goTo = (path: string) => {
        navigate(path);
        setIsMobileNavOpen(false);
    };

    const navItem = (
        section: ActiveSection,
        label: string,
        path: string,
        Icon: React.ElementType,
    ) => (
        <Button
            variant="ghost"
            className={`w-full justify-start ${
                activeSection === section
                    ? 'text-gold bg-gold/10'
                    : 'text-cream/70 hover:bg-gold/10 hover:text-gold'
            }`}
            onClick={() => goTo(path)}
        >
            <Icon className="w-4 h-4 mr-3" />
            {label}
        </Button>
    );

    const sidebarContent = (
        <>
            <div className="flex items-center gap-3 mb-10">
                <div className="w-24 h-24 flex items-center justify-center rounded-full bg-white p-1 shadow-sm">
                    <EmpresaLogo empresa={empresa} className="w-full h-full object-contain" />
                </div>
                <div>
                    <h2 className="font-heading text-cream text-lg">{nomePainel}</h2>
                    <p className="text-cream/50 text-xs">Administração</p>
                </div>
            </div>

            <nav className="flex-1 space-y-2">
                {navItem('dashboard',   'Dashboard',  '/admin/dashboard',   LayoutDashboard)}
                {navItem('velorios',    'Velórios',   '/admin/velorios',    Calendar)}
                {navItem('salas',       'Salas',      '/admin/salas',       Building2)}
                {navItem('cameras',     'Câmeras',    '/admin/cameras',     Camera)}
                {navItem('relatorios',  'Relatórios', '/admin/relatorios',  FileText)}
                {isSuperadmin && navItem('usuarios', 'Usuários', '/admin/usuarios', UserCog)}
                {isAdmin && (
                    <div>
                        <Button
                            variant="ghost"
                            className={`w-full justify-start ${
                                activeSection === 'configuracoes'
                                    ? 'text-gold bg-gold/10'
                                    : 'text-cream/70 hover:bg-gold/10 hover:text-gold'
                            }`}
                            onClick={() => setIsConfigOpen((open) => !open)}
                        >
                            <Settings className="w-4 h-4 mr-3" />
                            Configurações
                            <ChevronDown
                                className={`w-4 h-4 ml-auto transition-transform ${
                                    isConfigOpen ? 'rotate-180' : ''
                                }`}
                            />
                        </Button>
                        {isConfigOpen && (
                            <div className="pl-2 mt-1">
                                <Button
                                    variant="ghost"
                                    className={`w-full h-auto items-start justify-start whitespace-normal text-left py-2 px-3 ${
                                        location.pathname === '/admin/configuracoes/homenagens'
                                            ? 'text-gold bg-gold/10'
                                            : 'text-cream/70 hover:bg-gold/10 hover:text-gold'
                                    }`}
                                    onClick={() => goTo('/admin/configuracoes/homenagens')}
                                >
                                    <MessageSquareHeart className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                                    Banco de Homenagens
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </nav>

            <Button
                variant="ghost"
                className="w-full justify-start text-cream/50 hover:bg-destructive/20 hover:text-destructive"
                onClick={handleLogout}
            >
                <LogOut className="w-4 h-4 mr-3" />
                Sair
            </Button>
        </>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Desktop sidebar — unchanged from previous behavior */}
            <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 gradient-elegant border-r border-gold/20 p-6 flex-col">
                {sidebarContent}
            </aside>

            {/* Mobile top bar */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 gradient-elegant border-b border-gold/20 flex items-center justify-between px-4 z-40">
                <div className="flex items-center gap-2">
                    <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white p-0.5 shadow-sm">
                        <EmpresaLogo empresa={empresa} className="w-full h-full object-contain" />
                    </div>
                    <h2 className="font-heading text-cream text-base truncate">{nomePainel}</h2>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-cream hover:bg-gold/10 hover:text-gold"
                    onClick={() => setIsMobileNavOpen(true)}
                    aria-label="Abrir menu"
                >
                    <Menu className="w-5 h-5" />
                </Button>
            </header>

            {/* Mobile drawer */}
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <SheetContent
                    side="left"
                    className="w-72 border-gold/20 p-6 flex flex-col text-cream"
                    style={{ background: 'var(--gradient-elegant)' }}
                >
                    <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                    {sidebarContent}
                </SheetContent>
            </Sheet>

            <main className="p-8 pt-20 md:pt-8 md:ml-64">
                {children}
            </main>
        </div>
    );
}
