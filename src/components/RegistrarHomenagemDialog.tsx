import { ReactNode, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from '@/components/TermsDialog';
import { UserRound, Phone, Mail, Heart, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRegisterVisitante } from '@/hooks/useVisitantes';
import { useRecordTermsAcceptance } from '@/hooks/useTermsAcceptance';
import { hasAcceptedCurrentTerms } from '@/services/termsAcceptanceService';
import { useSubmitHomenagem } from '@/hooks/useHomenagens';
import { getUserAgent, getClientIP } from '@/services/accessLogsService';
import { getSavedVisitor, saveVisitor } from '@/lib/visitorStorage';
import { formatCelular } from '@/lib/phoneMask';

type Step = 'identificacao' | 'homenagem' | 'sucesso';

interface RegistrarHomenagemDialogProps {
  velorio_id: string;
  velorio_nome: string;
  trigger: ReactNode;
}

export function RegistrarHomenagemDialog({ velorio_id, velorio_nome, trigger }: RegistrarHomenagemDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('identificacao');
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [acceptedForCelular, setAcceptedForCelular] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [parentesco, setParentesco] = useState('');
  const [mensagem, setMensagem] = useState('');

  const { toast } = useToast();
  const { mutateAsync: registerVisitanteMutate, isPending: isRegistering } = useRegisterVisitante();
  const { mutateAsync: recordTermsAcceptanceMutate, isPending: isRecordingTerms } = useRecordTermsAcceptance();
  const { mutate: submitHomenagemMutate, isPending: isSubmittingHomenagem } = useSubmitHomenagem();

  const needsTermsCheckbox = acceptedForCelular === null || celular.trim() !== acceptedForCelular;

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setStep('identificacao');
      setParentesco('');
      setMensagem('');
      return;
    }

    const saved = getSavedVisitor();
    if (saved) {
      setNome(saved.nome);
      setCelular(saved.celular);
      setEmail(saved.email);
      try {
        const accepted = await hasAcceptedCurrentTerms(saved.celular, velorio_id);
        setAcceptedForCelular(accepted ? saved.celular.trim() : null);
        setTermsAccepted(accepted);
      } catch {
        setAcceptedForCelular(null);
        setTermsAccepted(false);
      }
    } else {
      setNome('');
      setCelular('');
      setEmail('');
      setAcceptedForCelular(null);
      setTermsAccepted(false);
    }
  };

  const handleSubmitIdentificacao = async () => {
    const celularDigits = celular.replace(/\D/g, '');

    if (!nome.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Por favor, informe seu nome.', variant: 'destructive' });
      return;
    }
    if (celularDigits.length < 10) {
      toast({ title: 'Celular inválido', description: 'Informe um número de celular válido com DDD.', variant: 'destructive' });
      return;
    }
    if (needsTermsCheckbox && !termsAccepted) {
      toast({ title: 'Termos de Uso', description: 'Você precisa aceitar os Termos de Uso para continuar.', variant: 'destructive' });
      return;
    }

    try {
      const visitante = { nome: nome.trim(), celular: celular.trim(), email: email.trim() || undefined };
      const writes: Promise<unknown>[] = [registerVisitanteMutate({ velorio_id, ...visitante })];

      if (needsTermsCheckbox) {
        const userAgent = getUserAgent();
        const ipAddress = await getClientIP();
        writes.push(
          recordTermsAcceptanceMutate({
            velorio_id,
            ...visitante,
            ip_address: ipAddress || undefined,
            user_agent: userAgent,
          })
        );
      }

      await Promise.all(writes);
      saveVisitor({ nome: visitante.nome, celular: visitante.celular, email: visitante.email ?? '' });
      setStep('homenagem');
    } catch {
      toast({
        title: 'Erro ao registrar',
        description: 'Não foi possível salvar seus dados. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitHomenagem = () => {
    if (!mensagem.trim()) {
      toast({ title: 'Mensagem vazia', description: 'Escreva uma mensagem antes de enviar.', variant: 'destructive' });
      return;
    }

    submitHomenagemMutate(
      {
        velorio_id,
        autor_nome: nome.trim(),
        parentesco: parentesco.trim() || undefined,
        mensagem: mensagem.trim(),
      },
      {
        onSuccess: () => setStep('sucesso'),
        onError: () => {
          toast({
            title: 'Erro ao enviar',
            description: 'Não foi possível enviar sua homenagem. Tente novamente.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        {step === 'identificacao' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserRound className="w-5 h-5 text-gold" />
                Identificação
              </DialogTitle>
              <DialogDescription>
                Velório de <span className="font-medium text-foreground">{velorio_nome}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rh-nome">Nome completo *</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-nome"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-celular">Celular (WhatsApp) *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-celular"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={celular}
                    onChange={(e) => setCelular(formatCelular(e.target.value))}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-email">
                  E-mail <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-email"
                    type="email"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {needsTermsCheckbox && (
                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="rh-terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm font-normal leading-snug text-muted-foreground">
                    <Label htmlFor="rh-terms">Li e aceito os</Label>{' '}
                    <TermsDialog
                      trigger={
                        <button type="button" className="text-gold underline underline-offset-2">
                          Termos de Uso e a Política de Privacidade de Imagem
                        </button>
                      }
                    />
                  </span>
                </div>
              )}

              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleSubmitIdentificacao}
                disabled={isRegistering || isRecordingTerms}
              >
                {isRegistering || isRecordingTerms ? 'Salvando...' : 'Continuar'}
              </Button>
            </div>
          </>
        )}

        {step === 'homenagem' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-gold" />
                Sua homenagem
              </DialogTitle>
              <DialogDescription>
                Velório de <span className="font-medium text-foreground">{velorio_nome}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rh-parentesco">
                  Parentesco <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="rh-parentesco"
                  placeholder="Ex: Amigo, Sobrinho, Colega de trabalho"
                  value={parentesco}
                  onChange={(e) => setParentesco(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-mensagem">Homenagem *</Label>
                <Textarea
                  id="rh-mensagem"
                  placeholder="Escreva uma mensagem de carinho..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  className="min-h-[120px] resize-none"
                  maxLength={500}
                />
              </div>

              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleSubmitHomenagem}
                disabled={isSubmittingHomenagem || !mensagem.trim()}
              >
                {isSubmittingHomenagem ? 'Enviando...' : 'Registrar Homenagem'}
              </Button>
            </div>
          </>
        )}

        {step === 'sucesso' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-gold" />
                Homenagem registrada
              </DialogTitle>
              <DialogDescription className="sr-only">
                Sua homenagem foi registrada com sucesso
              </DialogDescription>
            </DialogHeader>

            <div className="text-center py-4">
              <p className="text-foreground">
                Obrigado por prestar seus respeitos à memória de{' '}
                <span className="font-medium">{velorio_nome}</span>.
              </p>
            </div>

            <Button variant="gold" size="lg" className="w-full" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
