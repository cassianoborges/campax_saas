import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputToken } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CrossIcon, CandleIcon } from '@/components/icons/MemorialIcons';
import { apiClient } from '@/lib/apiClient';
import { getVelorioStatus, Velorio } from '@/hooks/useVelorios';
import { useToast } from '@/hooks/use-toast';
import { logVelorioAccess, getUserAgent, getClientIP } from '@/services/accessLogsService';
import { useRegisterVisitante } from '@/hooks/useVisitantes';
import { hasAcceptedCurrentTerms } from '@/services/termsAcceptanceService';
import { useRecordTermsAcceptance } from '@/hooks/useTermsAcceptance';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from '@/components/TermsDialog';
import { getSavedVisitor, saveVisitor } from '@/lib/visitorStorage';
import { formatCelular } from '@/lib/phoneMask';
import { UserRound, Phone, Mail } from 'lucide-react';
import { EmpresaLogo, TransmissaoPorCampax } from '@/components/EmpresaLogo';
import { useBranding } from '@/hooks/useBranding';
import { EmpresaPublica } from '@/types/empresa';
import { useHostEmpresa } from '@/hooks/useHostEmpresa';
import { HOST_SLUG } from '@/lib/hostEmpresa';

type Step = 'token' | 'confirm' | 'visitor';

const PublicAccess = () => {
  const [step, setStep] = useState<Step>('token');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingVelorioId, setPendingVelorioId] = useState('');
  const [pendingVelorioName, setPendingVelorioName] = useState('');
  // Unknown until the token resolves: the next steps use the velório's funerária (B5).
  const [pendingEmpresa, setPendingEmpresa] = useState<EmpresaPublica | null>(null);

  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { empresa: hostEmpresa } = useHostEmpresa();
  const { mutateAsync: registerVisitante, isPending: isRegistering } = useRegisterVisitante();
  const { mutateAsync: recordTermsAcceptance, isPending: isRecordingTerms } = useRecordTermsAcceptance();
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam.toUpperCase().slice(0, 6));
    }
  }, [searchParams]);

  const handleAccess = async () => {
    if (token.length !== 6) {
      toast({
        title: "Token inválido",
        description: "Por favor, insira um token de 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      let velorio: Velorio | null = null;
      try {
        const filtro = HOST_SLUG ? `?empresa=${encodeURIComponent(HOST_SLUG)}` : '';
        const res = await apiClient.get<{ data: Velorio }>(`/public/velorios/${token.toUpperCase()}${filtro}`);
        velorio = res.data;
      } catch {
        velorio = null;
      }

      if (!velorio) {
        toast({
          title: "Token inválido",
          description: "Verifique o código fornecido.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const status = getVelorioStatus(velorio);

      if (status === 'Encerrado') {
        toast({
          title: "Velório encerrado",
          description: "Este velório já foi encerrado.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (status === 'Agendado') {
        toast({
          title: "Velório ainda não começou",
          description: `O velório está agendado para iniciar em ${new Date(velorio.data_inicio).toLocaleDateString('pt-BR')} às ${new Date(velorio.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      setPendingVelorioId(velorio.id);
      setPendingVelorioName(velorio.nome_falecido);
      setPendingEmpresa(velorio.empresa ?? null);

      const saved = getSavedVisitor();
      if (saved) {
        setNome(saved.nome);
        setCelular(saved.celular);
        setEmail(saved.email);
        let accepted = false;
        try {
          accepted = await hasAcceptedCurrentTerms(saved.celular, velorio.id);
        } catch {
          accepted = false;
        }
        setStep(accepted ? 'confirm' : 'visitor');
      } else {
        setStep('visitor');
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao verificar o token. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmVisitor = async () => {
    try {
      const visitante = { nome: nome.trim(), celular: celular.trim(), email: email.trim() || undefined };
      await registerVisitante({ velorio_id: pendingVelorioId, ...visitante });
      const userAgent = getUserAgent();
      const ipAddress = await getClientIP();
      await logVelorioAccess(pendingVelorioId, token.toUpperCase(), ipAddress || undefined, userAgent, visitante);
      navigate(`/velorio/${pendingVelorioId}`);
    } catch {
      toast({
        title: "Erro ao registrar",
        description: "Não foi possível salvar seus dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleRegisterVisitor = async () => {
    const celularDigits = celular.replace(/\D/g, '');

    if (!nome.trim()) {
      toast({ title: "Nome obrigatório", description: "Por favor, informe seu nome.", variant: "destructive" });
      return;
    }
    if (celularDigits.length < 10) {
      toast({ title: "Celular inválido", description: "Informe um número de celular válido com DDD.", variant: "destructive" });
      return;
    }
    if (!termsAccepted) {
      toast({ title: "Termos de Uso", description: "Você precisa aceitar os Termos de Uso para continuar.", variant: "destructive" });
      return;
    }

    try {
      const visitante = { nome: nome.trim(), celular: celular.trim(), email: email.trim() || undefined };
      const userAgent = getUserAgent();
      const ipAddress = await getClientIP();
      await Promise.all([
        registerVisitante({ velorio_id: pendingVelorioId, ...visitante }),
        logVelorioAccess(pendingVelorioId, token.toUpperCase(), ipAddress || undefined, userAgent, visitante),
        recordTermsAcceptance({
          velorio_id: pendingVelorioId,
          ...visitante,
          ip_address: ipAddress || undefined,
          user_agent: userAgent,
        }),
      ]);
      saveVisitor({ nome: nome.trim(), celular: celular.trim(), email: email.trim() });
      navigate(`/velorio/${pendingVelorioId}`);
    } catch (error) {
      toast({
        title: "Erro ao registrar",
        description: "Não foi possível salvar seus dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Token step: the address's funerária on its subdomain, Campax on the generic address (B5);
  // later steps use the velório's funerária.
  const empresa = step === 'token' ? hostEmpresa : pendingEmpresa;
  useBranding(empresa);

  return (
    <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

      <div className="w-full max-w-md animate-fade-in">
        {/* Logo/Icon section */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-48 h-48 flex items-center justify-center mb-8">
            <EmpresaLogo empresa={empresa} className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <h1 className="font-heading text-3xl md:text-4xl text-foreground text-center mb-2">
            {empresa?.nome_exibicao ?? 'Velório Online'}
          </h1>
          <p className="text-muted-foreground text-center max-w-xs">
            Acompanhe a cerimônia de despedida com respeito e dignidade
          </p>
        </div>

        {step === 'token' ? (
          <div className="bg-card rounded-xl p-8 shadow-elegant border border-border">
            <div className="flex items-center justify-center gap-2 mb-6">
              <CandleIcon />
              <h2 className="font-heading text-xl text-foreground">
                Acesse com seu Token
              </h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm text-muted-foreground mb-2 text-center">
                  Insira o código de 6 dígitos fornecido
                </label>
                <InputToken
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="Ex: AX9B4Z"
                />
              </div>

              <Button
                variant="gold"
                size="xl"
                className="w-full"
                onClick={handleAccess}
                disabled={isLoading || token.length !== 6}
              >
                {isLoading ? 'Verificando...' : 'Acessar Velório'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Caso não possua o token de acesso, entre em contato com a família ou administração.
            </p>
          </div>
        ) : step === 'confirm' ? (
          <div className="bg-card rounded-xl p-8 shadow-elegant border border-border">
            <div className="flex items-center justify-center gap-2 mb-2">
              <UserRound className="w-5 h-5 text-gold" />
              <h2 className="font-heading text-xl text-foreground">
                Bem-vindo de volta
              </h2>
            </div>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Velório de <span className="font-medium text-foreground">{pendingVelorioName}</span>
            </p>

            <div className="bg-muted/50 rounded-lg p-4 mb-6 space-y-1">
              <p className="font-medium text-foreground">{nome}</p>
              <p className="text-sm text-muted-foreground">{celular}</p>
              {email && <p className="text-sm text-muted-foreground">{email}</p>}
            </div>

            <Button
              variant="gold"
              size="xl"
              className="w-full mb-3"
              onClick={handleConfirmVisitor}
              disabled={isRegistering}
            >
              {isRegistering ? 'Entrando...' : `Entrar como ${nome.split(' ')[0]}`}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setStep('visitor')}
              disabled={isRegistering}
            >
              Alterar dados
            </Button>
          </div>
        ) : (
          <div className="bg-card rounded-xl p-8 shadow-elegant border border-border">
            <div className="flex items-center justify-center gap-2 mb-2">
              <UserRound className="w-5 h-5 text-gold" />
              <h2 className="font-heading text-xl text-foreground">
                Identificação do Visitante
              </h2>
            </div>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Velório de <span className="font-medium text-foreground">{pendingVelorioName}</span>
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome completo *</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nome"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="celular">Celular (WhatsApp) *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="celular"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={celular}
                    onChange={(e) => setCelular(formatCelular(e.target.value))}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">
                  E-mail <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 pt-2">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm font-normal leading-snug text-muted-foreground">
                  <Label htmlFor="terms">Li e aceito os</Label>{' '}
                  <TermsDialog
                    trigger={
                      <button type="button" className="text-gold underline underline-offset-2">
                        Termos de Uso e a Política de Privacidade de Imagem
                      </button>
                    }
                  />
                </span>
              </div>

              <Button
                variant="gold"
                size="xl"
                className="w-full mt-2"
                onClick={handleRegisterVisitor}
                disabled={isRegistering || isRecordingTerms || !termsAccepted}
              >
                {isRegistering || isRecordingTerms ? 'Entrando...' : 'Entrar no Velório'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Seus dados são usados apenas para registro de presença.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <Button
            variant="link"
            onClick={() => navigate('/admin')}
            className="text-muted-foreground hover:text-gold"
          >
            Acesso Administrativo
          </Button>
        </div>
        {empresa && <TransmissaoPorCampax className="mt-6 text-muted-foreground" />}
      </div>
    </div>
  );
};

export default PublicAccess;
