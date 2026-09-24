import { useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, User } from 'lucide-react';
import { useVelorioAudit } from '@/hooks/useVelorioAudit';
import { exportVelorioAuditToCSV, downloadVelorioAuditCSV } from '@/services/velorioAuditService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function VelorioAuditTable() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [salaFilter, setSalaFilter] = useState('');

    // Build filters
    const filters = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        sala: salaFilter || undefined,
    };

    const { data: velorios, isLoading } = useVelorioAudit(filters);

    const handleExportCSV = () => {
        if (!velorios || velorios.length === 0) return;
        const csvContent = exportVelorioAuditToCSV(velorios);
        const filename = `relatorio-velorios-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
        downloadVelorioAuditCSV(csvContent, filename);
    };

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSalaFilter('');
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Ao Vivo':
                return 'bg-red-500/10 text-red-500';
            case 'Agendado':
                return 'bg-gold/10 text-gold';
            case 'Encerrado':
                return 'bg-muted text-muted-foreground';
            default:
                return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-heading">Histórico de Criação de Velórios</CardTitle>
                    <Button
                        onClick={handleExportCSV}
                        disabled={!velorios || velorios.length === 0}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="space-y-2">
                        <Label htmlFor="start-date">Data Início</Label>
                        <div className="relative">
                            <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="start-date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="end-date">Data Fim</Label>
                        <div className="relative">
                            <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="end-date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sala-filter">Sala</Label>
                        <div className="relative">
                            <User className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="sala-filter"
                                placeholder="Filtrar por sala..."
                                value={salaFilter}
                                onChange={(e) => setSalaFilter(e.target.value)}
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

                {/* Table */}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data/Hora Criação</TableHead>
                                <TableHead>Falecido</TableHead>
                                <TableHead>Sala</TableHead>
                                <TableHead>Token</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Criado Por</TableHead>
                                <TableHead>Período do Velório</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8">
                                        <div className="flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mr-2" />
                                            Carregando...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : !velorios || velorios.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Nenhum velório encontrado com os filtros selecionados
                                    </TableCell>
                                </TableRow>
                            ) : (
                                velorios.map((velorio: any) => (
                                    <TableRow key={velorio.id}>
                                        <TableCell className="font-medium">
                                            {format(new Date(velorio.created_at), "dd/MM/yyyy 'às' HH:mm", {
                                                locale: ptBR,
                                            })}
                                        </TableCell>
                                        <TableCell>{velorio.nome_falecido}</TableCell>
                                        <TableCell>{velorio.sala?.nome_sala_velorio}</TableCell>
                                        <TableCell>
                                            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                                                {velorio.token_acesso}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(velorio.status)}`}>
                                                {velorio.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {velorio.created_by_email || 'Sistema'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(velorio.data_inicio), 'dd/MM HH:mm', { locale: ptBR })}
                                            {' → '}
                                            {format(new Date(velorio.data_fim), 'dd/MM HH:mm', { locale: ptBR })}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Results count */}
                {velorios && velorios.length > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground">
                        Exibindo {velorios.length} {velorios.length === 1 ? 'velório' : 'velórios'}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
