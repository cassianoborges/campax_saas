import { EmpresaLogo } from '@/components/EmpresaLogo';
import { EmpresaResumo } from '@/types/empresa';

interface EmpresaEscolhaProps {
    empresas: EmpresaResumo[];
    /** The empresa already active (shown as "Atual" and not clickable). */
    atualId?: string;
    onEscolher: (empresaId: string) => void;
    carregando?: boolean;
}

/** Cards of the user's empresas, for the post-login choice and "Trocar empresa" (spec 10). */
export function EmpresaEscolha({ empresas, atualId, onEscolher, carregando }: EmpresaEscolhaProps) {
    return (
        <div className="grid gap-3">
            {empresas.map((empresa) => {
                const atual = empresa.id === atualId;
                const disabled = carregando || atual || !empresa.ativo;
                return (
                    <button
                        key={empresa.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onEscolher(empresa.id)}
                        className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
                    >
                        <div className="w-12 h-12 shrink-0 rounded-full bg-white p-1 shadow-sm flex items-center justify-center">
                            <EmpresaLogo empresa={empresa} className="w-full h-full object-contain" />
                        </div>
                        <span className="flex-1 min-w-0 font-medium text-foreground truncate">{empresa.nome_exibicao}</span>
                        {atual && <span className="text-xs text-gold">Atual</span>}
                        {!empresa.ativo && <span className="text-xs text-muted-foreground">Suspensa</span>}
                    </button>
                );
            })}
        </div>
    );
}
