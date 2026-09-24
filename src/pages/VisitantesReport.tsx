import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Users, Download, Search, Calendar } from 'lucide-react';
import { useVisitantes } from '@/hooks/useVisitantes';
import { useVelorios } from '@/hooks/useVelorios';
import { exportVisitantesToCSV, downloadCSV } from '@/services/visitantesService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const VisitantesReport = () => {
    const navigate = useNavigate();
    const [selectedVelorio, setSelectedVelorio] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { velorios } = useVelorios();

    const filters = {
        velorioId: selectedVelorio !== 'all' ? selectedVelorio : undefined,
        search: search || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
    };

    const { data: visitantes, isLoading } = useVisitantes(filters);

    const handleExportCSV = () => {
        if (!visitantes || visitantes.length === 0) return;
        const csv = exportVisitantesToCSV(visitantes);
        downloadCSV(csv, `visitantes-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`);
    };

    const handleClearFilters = () => {
        setSelectedVelorio('all');
        setSearch('');
        setStartDate('');
        setEndDate('');
    };

    return (
        <div className="min-h-screen gradient-soft">
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
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
                            <Users className="w-6 h-6 text-gold" />
                            <h1 className="font-heading text-2xl text-foreground">
                                Visitantes Cadastrados
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="space-y-8">
                    <div className="bg-card rounded-lg p-6 border border-border">
                        <h2 className="font-heading text-lg mb-2">Sobre este Relatório</h2>
                        <p className="text-muted-foreground text-sm">
                            Lista de visitantes que se identificaram ao acessar velórios online.
                            Filtre por velório, nome ou período e exporte os dados em CSV.
                        </p>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-xl font-heading">Registro de Visitantes</CardTitle>
                                <Button
                                    onClick={handleExportCSV}
                                    disabled={!visitantes || visitantes.length === 0}
                                    variant="outline"
                                    size="sm"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Exportar CSV
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <div className="space-y-2">
                                    <Label>Velório</Label>
                                    <Select value={selectedVelorio} onValueChange={setSelectedVelorio}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Todos os velórios" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os velórios</SelectItem>
                                            {velorios?.map((v) => (
                                                <SelectItem key={v.id} value={v.id}>
                                                    {v.nome_falecido} — {v.sala?.nome_sala_velorio}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Nome</Label>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar por nome..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Data Início</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Data Fim</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end mb-4">
                                <Button onClick={handleClearFilters} variant="ghost" size="sm">
                                    Limpar Filtros
                                </Button>
                            </div>

                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Celular</TableHead>
                                            <TableHead>E-mail</TableHead>
                                            <TableHead>Velório</TableHead>
                                            <TableHead>Data/Hora</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8">
                                                    <div className="flex items-center justify-center">
                                                        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mr-2" />
                                                        Carregando...
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : !visitantes || visitantes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                    Nenhum visitante encontrado com os filtros selecionados
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            visitantes.map((v: any) => (
                                                <TableRow key={v.id}>
                                                    <TableCell className="font-medium">{v.nome}</TableCell>
                                                    <TableCell>{v.celular}</TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {v.email || '—'}
                                                    </TableCell>
                                                    <TableCell>{v.velorios?.nome_falecido || 'N/A'}</TableCell>
                                                    <TableCell>
                                                        {format(new Date(v.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {visitantes && visitantes.length > 0 && (
                                <div className="mt-4 text-sm text-muted-foreground">
                                    Exibindo {visitantes.length} {visitantes.length === 1 ? 'visitante' : 'visitantes'}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default VisitantesReport;
