import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmpresaEscolha } from '@/components/EmpresaEscolha';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';

/** After a provisional login (several empresas, generic address): pick the empresa to act for. */
const EscolherEmpresa = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user, loading, role, empresas, precisaEscolherEmpresa, trocarEmpresa, signOut } = useAuth();
    const [carregando, setCarregando] = useState(false);

    if (loading) return null;
    if (!user) return <Navigate to="/admin" replace />;
    if (!precisaEscolherEmpresa) return <Navigate to={homePathFor(role)} replace />;

    const escolher = async (empresaId: string) => {
        setCarregando(true);
        try {
            await trocarEmpresa(empresaId);
            navigate('/admin/dashboard');
        } catch (error) {
            toast({ title: 'Não foi possível entrar nessa empresa', description: (error as Error).message, variant: 'destructive' });
            setCarregando(false);
        }
    };

    return (
        <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md animate-fade-in">
                <h1 className="font-heading text-2xl text-foreground text-center mb-2">Escolha a empresa</h1>
                <p className="text-muted-foreground text-center mb-8">Você tem acesso a mais de uma funerária.</p>
                <EmpresaEscolha empresas={empresas} onEscolher={escolher} carregando={carregando} />
                <div className="mt-6 text-center">
                    <Button
                        variant="link"
                        className="text-muted-foreground hover:text-gold"
                        onClick={async () => {
                            await signOut();
                            navigate('/admin');
                        }}
                    >
                        Sair
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default EscolherEmpresa;
