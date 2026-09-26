import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Pencil, RefreshCw } from 'lucide-react';
import { useUsers, ProfileRow } from '@/hooks/useUsers';
import { useToast } from '@/hooks/use-toast';
import { generatePassword } from '@/lib/generatePassword';

export function EditUserDialog({ user, permitirSenha = true }: { user: ProfileRow; permitirSenha?: boolean }) {
    const [open, setOpen] = useState(false);
    const [fullName, setFullName] = useState(user.full_name || '');
    const [whatsapp, setWhatsapp] = useState(user.numero_whatsapp || '');
    const [agenteIa, setAgenteIa] = useState(user.agente_ia || false);
    const [password, setPassword] = useState('');
    const { updateUser } = useUsers();
    const { toast } = useToast();

    const resetForm = () => {
        setFullName(user.full_name || '');
        setWhatsapp(user.numero_whatsapp || '');
        setAgenteIa(user.agente_ia || false);
        setPassword('');
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateUser.mutateAsync({
                userId: user.id,
                full_name: fullName,
                numero_whatsapp: whatsapp,
                agente_ia: agenteIa,
                password: password || undefined,
            });
            toast({ title: 'Usuário atualizado com sucesso.' });
            handleOpenChange(false);
        } catch (err: unknown) {
            toast({
                title: 'Erro ao atualizar usuário',
                description: err instanceof Error ? err.message : 'Tente novamente.',
                variant: 'destructive',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    <Pencil className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading">Editar Usuário</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-1">
                        <Label htmlFor="edit-name">Nome completo</Label>
                        <Input
                            id="edit-name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Opcional"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="edit-whatsapp">WhatsApp</Label>
                        <Input
                            id="edit-whatsapp"
                            type="tel"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            placeholder="+55 62 99999-9999"
                        />
                    </div>
                    {permitirSenha ? (
                        <div className="space-y-1">
                            <Label htmlFor="edit-password">Nova senha</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="edit-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Deixe em branco para manter a senha atual"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    title="Gerar senha"
                                    onClick={() => setPassword(generatePassword())}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Deixe em branco para manter a senha atual.
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            A senha deste usuário só pode ser redefinida pelo suporte da Campax, porque ele também atende outra empresa.
                        </p>
                    )}
                    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <div>
                            <Label htmlFor="edit-agente-ia" className="text-sm font-medium">
                                Agente IA
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Habilitar integração com agente de inteligência artificial
                            </p>
                        </div>
                        <Switch
                            id="edit-agente-ia"
                            checked={agenteIa}
                            onCheckedChange={setAgenteIa}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="bg-gold text-background hover:bg-gold/90"
                        >
                            {updateUser.isPending ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
