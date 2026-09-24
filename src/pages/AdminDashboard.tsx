import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/AdminLayout';
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { useCameras } from '@/hooks/useCameras';
import { usePresenceMultiple } from '@/hooks/usePresenceMultiple';
import {
  Radio,
  Clock,
  Users,
  Camera,
  Calendar,
  CircleDot,
} from 'lucide-react';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { velorios, isLoading: veloriosLoading } = useVelorios();
  const { cameras, isLoading: camerasLoading } = useCameras();

  const activeVelorios = velorios.filter(v => getVelorioStatus(v) === 'Ao Vivo').length;
  const scheduledVelorios = velorios.filter(v => getVelorioStatus(v) === 'Agendado').length;
  const totalCameras = cameras.length;

  const nonEndedIds = velorios
    .filter(v => getVelorioStatus(v) !== 'Encerrado')
    .map(v => v.id);
  const presenceMap = usePresenceMultiple(nonEndedIds);
  const totalOnline = [...presenceMap.values()].reduce((sum, s) => sum + s.count, 0);

  return (
    <AdminLayout activeSection="dashboard">
      <header className="mb-8">
        <h1 className="font-heading text-3xl text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema</p>
      </header>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card className="shadow-elegant border-gold/10 hover:border-gold/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ao Vivo</CardTitle>
            <Radio className="w-4 h-4 text-red-500 animate-gentle-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-heading text-foreground">{activeVelorios}</div>
            <p className="text-xs text-muted-foreground mt-1">velórios transmitindo agora</p>
          </CardContent>
        </Card>

        <Card className="shadow-elegant border-gold/10 hover:border-gold/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agendados</CardTitle>
            <Clock className="w-4 h-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-heading text-foreground">{scheduledVelorios}</div>
            <p className="text-xs text-muted-foreground mt-1">velórios programados</p>
          </CardContent>
        </Card>

        <Card className="shadow-elegant border-gold/10 hover:border-gold/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Câmeras</CardTitle>
            <Camera className="w-4 h-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-heading text-foreground">{totalCameras}</div>
            <p className="text-xs text-muted-foreground mt-1">câmeras cadastradas</p>
          </CardContent>
        </Card>

        <Card className="shadow-elegant border-green-500/20 hover:border-green-500/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online Agora</CardTitle>
            <CircleDot className="w-4 h-4 text-green-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-heading text-foreground">{totalOnline}</div>
            <p className="text-xs text-muted-foreground mt-1">visitantes assistindo</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-elegant">
        <CardHeader>
          <CardTitle className="font-heading text-xl flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" />
            Velórios Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {veloriosLoading || camerasLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : velorios.filter(v => getVelorioStatus(v) !== 'Encerrado').length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum velório ativo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {velorios
                .filter(v => getVelorioStatus(v) !== 'Encerrado')
                .map((velorio) => {
                  const status = getVelorioStatus(velorio);
                  const presence = presenceMap.get(velorio.id);
                  const onlineCount = presence?.count ?? 0;
                  return (
                    <div
                      key={velorio.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/velorios`)}
                    >
                      <div>
                        <h3 className="font-medium text-foreground">{velorio.nome_falecido}</h3>
                        <p className="text-sm text-muted-foreground">{velorio.sala?.nome_sala_velorio}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {onlineCount > 0 && (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            {onlineCount} online
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {velorio.token_acesso}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          status === 'Ao Vivo'
                            ? 'bg-red-500/10 text-red-500'
                            : status === 'Agendado'
                              ? 'bg-gold/10 text-gold'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {status}
                        </span>
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
};

export default AdminDashboard;
