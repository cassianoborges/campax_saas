import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { Building, LogOut, Menu, MessageSquareHeart } from 'lucide-react';

type PlatformSection = 'empresas' | 'modelos';

interface PlatformLayoutProps {
    children: ReactNode;
    activeSection: PlatformSection;
}

/** Layout of the platform_admin area — same Campax look as AdminLayout, own menu, clearly labeled. */
export function PlatformLayout({ children, activeSection }: PlatformLayoutProps) {
    const navigate = useNavigate();
    const { signOut, profile } = useAuth();
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    const goTo = (path: string) => {
        navigate(path);
        setIsMobileNavOpen(false);
    };

    const navItem = (section: PlatformSection, label: string, path: string, Icon: React.ElementType) => (
        <Button
            variant="ghost"
            className={`w-full justify-start ${
                activeSection === section ? 'text-gold bg-gold/10' : 'text-cream/70 hover:bg-gold/10 hover:text-gold'
            }`}
            onClick={() => goTo(path)}
        >
            <Icon className="w-4 h-4 mr-3" />
            {label}
        </Button>
    );

    const brand = (
        <div className="flex items-center gap-3">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-white p-1 shadow-sm shrink-0">
                <img src="/logo-campax.png" alt="Logo Campax" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
                <h2 className="font-heading text-cream text-lg leading-tight">Campax</h2>
                <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground bg-gold px-2 py-0.5 rounded">
                    Plataforma
                </span>
            </div>
        </div>
    );

    const sidebarContent = (
        <>
            <div className="mb-10">{brand}</div>
            <nav className="flex-1 space-y-2">
                {navItem('empresas', 'Empresas', '/platform', Building)}
                {navItem('modelos', 'Modelos de homenagem', '/platform/modelos-homenagem', MessageSquareHeart)}
            </nav>
            {profile && <p className="text-cream/40 text-xs mb-3 truncate">{profile.email}</p>}
            <Button
                variant="ghost"
                className="w-full justify-start text-cream/50 hover:bg-destructive/20 hover:text-destructive"
                onClick={async () => {
                    await signOut();
                    navigate('/admin');
                }}
            >
                <LogOut className="w-4 h-4 mr-3" />
                Sair
            </Button>
        </>
    );

    return (
        <div className="min-h-screen bg-background">
            <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 gradient-elegant border-r border-gold/20 p-6 flex-col">
                {sidebarContent}
            </aside>

            <header className="md:hidden fixed top-0 left-0 right-0 h-16 gradient-elegant border-b border-gold/20 flex items-center justify-between px-4 z-40">
                {brand}
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

            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <SheetContent side="left" className="w-72 border-gold/20 p-6 flex flex-col text-cream" style={{ background: 'var(--gradient-elegant)' }}>
                    <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                    {sidebarContent}
                </SheetContent>
            </Sheet>

            <main className="p-4 sm:p-8 pt-20 md:pt-8 md:ml-64">{children}</main>
        </div>
    );
}

export function StatusBadge({ ativo }: { ativo: boolean }) {
    return ativo ? (
        <span className="text-xs px-2 py-0.5 rounded-full border bg-green-500/15 text-green-700 border-green-500/30">Ativa</span>
    ) : (
        <span className="text-xs px-2 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/30">Suspensa</span>
    );
}
