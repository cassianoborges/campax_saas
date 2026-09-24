import { AccessStatsCard } from '@/components/AccessStatsCard';
import { AccessLogsTable } from '@/components/AccessLogsTable';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AccessReports = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen gradient-soft">
            {/* Header */}
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => navigate('/admin/relatorios')}
                                className="hover:bg-primary/10"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Voltar
                            </Button>
                            <div className="flex items-center gap-2">
                                <FileText className="w-6 h-6 text-gold" />
                                <h1 className="font-heading text-2xl text-foreground">
                                    Relatórios de Acesso
                                </h1>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="container mx-auto px-4 py-8">
                <div className="space-y-8">
                    {/* Description */}
                    <div className="bg-card rounded-lg p-6 border border-border">
                        <h2 className="font-heading text-lg mb-2">Sobre este Relatório</h2>
                        <p className="text-muted-foreground text-sm">
                            Este relatório registra todos os acessos aos velórios realizados através de tokens.
                            Você pode filtrar por velório, token, período e exportar os dados em formato CSV.
                        </p>
                    </div>
                    {/* Statistics Cards */}
                    <AccessStatsCard />

                    {/* Access Logs Table */}
                    <AccessLogsTable />
                </div>
            </main>
        </div>
    );
};

export default AccessReports;
