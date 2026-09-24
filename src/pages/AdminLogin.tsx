import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CrossIcon } from '@/components/icons/MemorialIcons';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/hooks/useRole';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { EmpresaLogo } from '@/components/EmpresaLogo';
import { useHostEmpresa } from '@/hooks/useHostEmpresa';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { signIn, user, role } = useAuth();
  const { empresa: hostEmpresa } = useHostEmpresa();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate(homePathFor(role));
    }
  }, [user, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data, error } = await signIn(email, password);

    if (!error) {
      navigate(homePathFor(data?.profile.role));
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-48 h-48 flex items-center justify-center mb-8">
            <EmpresaLogo empresa={hostEmpresa} className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <h1 className="font-heading text-2xl text-foreground">
            Área Administrativa
          </h1>
          {hostEmpresa && <p className="text-muted-foreground mt-1">{hostEmpresa.nome_exibicao}</p>}
        </div>

        {/* Login form */}
        <div className="bg-card rounded-xl p-8 shadow-elegant border border-border">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@velorio.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Button
            variant="link"
            onClick={() => navigate('/')}
            className="text-muted-foreground hover:text-gold"
          >
            Voltar ao acesso público
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
