import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Eye, ClipboardList, ArrowRight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ReportsHub = () => {
    const navigate = useNavigate();

    const reports = [
        {
            id: 'access',
            title: 'Acessos ao Velório',
            description: 'Relatório de acessos públicos aos velórios via token',
            details: 'Visualize quem acessou cada velório online, quando foi o acesso, de qual dispositivo e outras informações relevantes.',
            icon: Eye,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 dark:bg-blue-950',
            route: '/admin/relatorios/acessos',
            badge: 'Público',
            badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        },
        {
            id: 'audit',
            title: 'Criação de Velórios',
            description: 'Auditoria de criação de velórios por administradores',
            details: 'Acompanhe o histórico completo de velórios criados, incluindo qual usuário administrador criou, data/hora e todas as informações da cerimônia.',
            icon: ClipboardList,
            color: 'text-purple-600',
            bgColor: 'bg-purple-50 dark:bg-purple-950',
            route: '/admin/relatorios/auditoria',
            badge: 'Admin',
            badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
        },
        {
            id: 'visitantes',
            title: 'Visitantes',
            description: 'Visitantes cadastrados nos velórios online',
            details: 'Visualize nome, celular e e-mail dos visitantes que se identificaram ao acessar os velórios. Filtre por velório ou período e exporte em CSV.',
            icon: Users,
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950',
            route: '/admin/relatorios/visitantes',
            badge: 'Público',
            badgeColor: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        },
    ];

    return (
        <div className="min-h-screen gradient-soft">
            {/* Header */}
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => navigate('/admin/dashboard')}
                                className="hover:bg-primary/10"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Voltar
                            </Button>
                            <div>
                                <h1 className="font-heading text-2xl text-foreground">
                                    Central de Relatórios
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Selecione o tipo de relatório que deseja visualizar
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="container mx-auto px-4 py-8">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* Info Card */}
                    <Card className="border-gold/20">
                        <CardHeader>
                            <CardTitle className="text-lg font-heading">Sobre os Relatórios</CardTitle>
                            <CardDescription>
                                O sistema oferece três tipos de relatórios para diferentes necessidades de auditoria e acompanhamento.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {/* Reports Grid */}
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {reports.map((report, index) => {
                            const Icon = report.icon;
                            return (
                                <Card
                                    key={report.id}
                                    className="hover:shadow-lg transition-all duration-300 cursor-pointer group border-2 hover:border-gold/30"
                                    onClick={() => navigate(report.route)}
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-lg ${report.bgColor}`}>
                                                <Icon className={`w-6 h-6 ${report.color}`} />
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${report.badgeColor}`}>
                                                {report.badge}
                                            </span>
                                        </div>
                                        <CardTitle className="font-heading text-xl mb-2 flex items-center justify-between">
                                            <span>{index + 1}. {report.title}</span>
                                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-all" />
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            {report.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {report.details}
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="w-full mt-4 group-hover:bg-gold/10 group-hover:border-gold transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(report.route);
                                            }}
                                        >
                                            Acessar Relatório
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Help Section */}
                    <Card className="bg-muted/50">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <div className="text-2xl">💡</div>
                                <div>
                                    <h3 className="font-medium mb-1">Dica</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Todos os relatórios podem ser exportados em formato CSV para análise externa.
                                        Use os filtros disponíveis em cada relatório para refinar os dados exibidos.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default ReportsHub;
