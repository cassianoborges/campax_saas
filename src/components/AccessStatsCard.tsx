import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Eye, Clock, TrendingUp } from 'lucide-react';
import { useOverallAccessStats } from '@/hooks/useAccessLogs';

export function AccessStatsCard() {
    const { data: stats, isLoading } = useOverallAccessStats();

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="animate-pulse">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="h-4 w-24 bg-muted rounded" />
                            <div className="h-4 w-4 bg-muted rounded" />
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 w-16 bg-muted rounded mb-1" />
                            <div className="h-3 w-32 bg-muted rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    const statCards = [
        {
            title: 'Total de Acessos',
            value: stats?.total_accesses || 0,
            description: 'Todos os acessos registrados',
            icon: Eye,
            color: 'text-blue-600',
        },
        {
            title: 'Velórios Acessados',
            value: stats?.total_velorios || 0,
            description: 'Velórios com pelo menos 1 acesso',
            icon: Users,
            color: 'text-purple-600',
        },
        {
            title: 'Acessos Hoje',
            value: stats?.accesses_today || 0,
            description: 'Acessos nas últimas 24 horas',
            icon: Clock,
            color: 'text-green-600',
        },
        {
            title: 'Últimos 7 Dias',
            value: stats?.accesses_last_7_days || 0,
            description: 'Acessos na última semana',
            icon: TrendingUp,
            color: 'text-orange-600',
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Card key={stat.title} className="hover:shadow-lg transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <Icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value.toLocaleString('pt-BR')}</div>
                            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
