import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EmpresaEscolha } from '@/components/EmpresaEscolha';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/** "Trocar empresa" in the admin sidebar — only rendered for users with more than one empresa. */
export function TrocarEmpresaDialog() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { empresa, empresas, trocarEmpresa } = useAuth();
    const [open, setOpen] = useState(false);
    const [carregando, setCarregando] = useState(false);

    const escolher = async (empresaId: string) => {
        setCarregando(true);
        try {
            await trocarEmpresa(empresaId);
            setOpen(false);
            navigate('/admin/dashboard');
        } catch (error) {
            toast({ title: 'Não foi possível trocar de empresa', description: (error as Error).message, variant: 'destructive' });
        } finally {
            setCarregando(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start text-cream/50 hover:bg-gold/10 hover:text-gold">
                    <ArrowLeftRight className="w-4 h-4 mr-3" />
                    Trocar empresa
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Trocar empresa</DialogTitle>
                    <DialogDescription>Escolha por qual funerária você quer trabalhar agora.</DialogDescription>
                </DialogHeader>
                <EmpresaEscolha empresas={empresas} atualId={empresa?.id} onEscolher={escolher} carregando={carregando} />
            </DialogContent>
        </Dialog>
    );
}
