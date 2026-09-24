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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Search, Calendar } from 'lucide-react';
import { useAccessLogs } from '@/hooks/useAccessLogs';
import { useVelorios } from '@/hooks/useVelorios';
import { exportAccessLogsToCSV, downloadCSV } from '@/services/accessLogsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AccessLogsTable() {
    const [selectedVelorio, setSelectedVelorio] = useState<string>('all');
    const [searchToken, setSearchToken] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { velorios } = useVelorios();

    // Build filters
    const filters = {
        velorioId: selectedVelorio !== 'all' ? selectedVelorio : undefined,
        token: searchToken || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
    };

    const { data: logs, isLoading } = useAccessLogs(filters);

    const handleExportCSV = () => {
        if (!logs || logs.length === 0) return;
        const csvContent = exportAccessLogsToCSV(logs);
        const filename = `relatorio-acessos-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
        downloadCSV(csvContent, filename);
    };

    const handleClearFilters = () => {
        setSelectedVelorio('all');
        setSearchToken('');
        setStartDate('');
        setEndDate('');
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-heading">Registro de Acessos</CardTitle>
                    <Button
                        onClick={handleExportCSV}
                        disabled={!logs || logs.length === 0}
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
                        <Label htmlFor="velorio-filter">Velório</Label>
                        <Select value={selectedVelorio} onValueChange={setSelectedVelorio}>
                            <SelectTrigger id="velorio-filter">
                                <SelectValue placeholder="Todos os velórios" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os velórios</SelectItem>
                                {velorios?.map((velorio) => (
                                    <SelectItem key={velorio.id} value={velorio.id}>
                                        {velorio.nome_falecido} - {velorio.sala?.nome_sala_velorio}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="token-filter">Token</Label>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="token-filter"
                                placeholder="Buscar por token..."
                                value={searchToken}
                                onChange={(e) => setSearchToken(e.target.value.toUpperCase())}
                                className="pl-8"
                                maxLength={6}
                            />
                        </div>
                    </div>

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
                                <TableHead>Data/Hora</TableHead>
                                <TableHead>Falecido</TableHead>
                                <TableHead>Sala</TableHead>
                                <TableHead>Token</TableHead>
                                <TableHead>Visitante</TableHead>
                                <TableHead>Celular</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Dispositivo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8">
                                        <div className="flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mr-2" />
                                            Carregando...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : !logs || logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        Nenhum acesso registrado com os filtros selecionados
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log: any) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-medium">
                                            {format(new Date(log.accessed_at), "dd/MM/yyyy 'às' HH:mm", {
                                                locale: ptBR,
                                            })}
                                        </TableCell>
                                        <TableCell>{log.velorios?.nome_falecido || 'N/A'}</TableCell>
                                        <TableCell>{log.velorios?.sala?.nome_sala_velorio || 'N/A'}</TableCell>
                                        <TableCell>
                                            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                                                {log.token_acesso}
                                            </code>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {log.nome_visitante || <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {log.celular_visitante || '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {log.ip_address || '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                            {log.user_agent ? (
                                                <span title={log.user_agent}>
                                                    {log.user_agent.length > 50
                                                        ? log.user_agent.substring(0, 50) + '...'
                                                        : log.user_agent}
                                                </span>
                                            ) : (
                                                'N/A'
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Results count */}
                {logs && logs.length > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground">
                        Exibindo {logs.length} {logs.length === 1 ? 'acesso' : 'acessos'}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
