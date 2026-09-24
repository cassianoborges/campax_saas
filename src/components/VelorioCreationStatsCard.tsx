import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, FileText, TrendingUp, Users } from 'lucide-react';
import { useVelorioCreationStats } from '@/hooks/useVelorioAudit';

export function VelorioCreationStatsCard() {
    const { data: stats, isLoading } = useVelorioCreationStats();

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
            title: 'Total de Velórios',
            value: stats?.total_velorios || 0,
            description: 'Velórios cadastrados no sistema',
            icon: FileText,
            color: 'text-blue-600',
        },
        {
            title: 'Criados Hoje',
            value: stats?.velorios_today || 0,
            description: 'Velórios criados nas últimas 24h',
            icon: Calendar,
            color: 'text-green-600',
        },
        {
            title: 'Última Semana',
            value: stats?.velorios_this_week || 0,
            description: 'Velórios criados nos últimos 7 dias',
            icon: TrendingUp,
            color: 'text-orange-600',
        },
        {
            title: 'Último Mês',
            value: stats?.velorios_this_month || 0,
            description: 'Velórios criados nos últimos 30 dias',
            icon: Users,
            color: 'text-purple-600',
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
