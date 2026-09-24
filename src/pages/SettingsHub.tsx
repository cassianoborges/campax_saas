import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MessageSquareHeart, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SettingsHub = () => {
    const navigate = useNavigate();

    const settings = [
        {
            id: 'homenagens',
            title: 'Banco de Homenagens',
            description: 'Mensagens de homenagem reutilizáveis para o cadastro de velórios',
            details: 'Cadastre mensagens-modelo com título e texto. Elas ficam disponíveis como dropdown no cadastro de velório, para preencher a Mensagem de Homenagem sem digitar do zero.',
            icon: MessageSquareHeart,
            color: 'text-pink-600',
            bgColor: 'bg-pink-50 dark:bg-pink-950',
            route: '/admin/configuracoes/homenagens',
        },
    ];

    return (
        <div className="min-h-screen gradient-soft">
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
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
                                Configurações
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Gerencie as configurações do sistema
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {settings.map((setting) => {
                            const Icon = setting.icon;
                            return (
                                <Card
                                    key={setting.id}
                                    className="hover:shadow-lg transition-all duration-300 cursor-pointer group border-2 hover:border-gold/30"
                                    onClick={() => navigate(setting.route)}
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-lg ${setting.bgColor}`}>
                                                <Icon className={`w-6 h-6 ${setting.color}`} />
                                            </div>
                                        </div>
                                        <CardTitle className="font-heading text-xl mb-2 flex items-center justify-between">
                                            <span>{setting.title}</span>
                                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-all" />
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            {setting.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {setting.details}
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="w-full mt-4 group-hover:bg-gold/10 group-hover:border-gold transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(setting.route);
                                            }}
                                        >
                                            Acessar
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SettingsHub;
