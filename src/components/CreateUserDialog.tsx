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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UserPlus, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { useUsers } from '@/hooks/useUsers';
import { TenantRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';
import { generatePassword } from '@/lib/generatePassword';

const ROLE_LABELS: Record<TenantRole, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    operador: 'Operador',
    viewer: 'Visualizador',
};

export function CreateUserDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<TenantRole>('viewer');
    const [whatsapp, setWhatsapp] = useState('');
    const [agenteIa, setAgenteIa] = useState(false);
    const { createUser } = useUsers();
    const { toast } = useToast();

    const resetForm = () => {
        setEmail('');
        setFullName('');
        setPassword('');
        setRole('viewer');
        setWhatsapp('');
        setAgenteIa(false);
        setStep('form');
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        try {
            await createUser.mutateAsync({
                email,
                password,
                role,
                full_name: fullName || undefined,
                numero_whatsapp: whatsapp || undefined,
                agente_ia: agenteIa,
            });
            setStep('success');
        } catch (err: unknown) {
            toast({
                title: 'Erro ao criar usuário',
                description: err instanceof Error ? err.message : 'Tente novamente.',
                variant: 'destructive',
            });
        }
    };

    const copyPassword = () => {
        navigator.clipboard.writeText(password);
        toast({ title: 'Senha copiada!' });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className="bg-gold text-background hover:bg-gold/90">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Criar Usuário
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading">
                        {step === 'success' ? 'Usuário criado com sucesso!' : 'Criar Novo Usuário'}
                    </DialogTitle>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="py-4 space-y-5">
                        <div className="flex flex-col items-center gap-2 pb-2">
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                            <p className="text-center text-muted-foreground text-sm">
                                Repasse o e-mail e a senha abaixo para o novo usuário.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground uppercase tracking-wide">E-mail</label>
                            <p className="font-medium text-foreground">{email}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground uppercase tracking-wide">Senha</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 font-mono text-sm bg-secondary rounded-lg py-2.5 px-3 text-gold">
                                    {password}
                                </div>
                                <Button variant="outline" size="icon" onClick={copyPassword}>
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <Button className="w-full" onClick={() => handleOpenChange(false)}>
                            Concluir
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1">
                            <Label htmlFor="create-email">E-mail *</Label>
                            <Input
                                id="create-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="usuario@empresa.com"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-name">Nome completo</Label>
                            <Input
                                id="create-name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Opcional"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-password">Senha *</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="create-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Digite ou gere uma senha"
                                    required
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
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-whatsapp">WhatsApp</Label>
                            <Input
                                id="create-whatsapp"
                                type="tel"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                placeholder="+55 62 99999-9999"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-role">Papel</Label>
                            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
                                <SelectTrigger id="create-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                            <div>
                                <Label htmlFor="create-agente-ia" className="text-sm font-medium">
                                    Agente IA
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Habilitar integração com agente de inteligência artificial
                                </p>
                            </div>
                            <Switch
                                id="create-agente-ia"
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
                                disabled={createUser.isPending}
                                className="bg-gold text-background hover:bg-gold/90"
                            >
                                {createUser.isPending ? 'Criando...' : 'Criar usuário'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
