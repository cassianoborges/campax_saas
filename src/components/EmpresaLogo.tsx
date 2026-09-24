import { useState } from 'react';
import { EmpresaPublica } from '@/types/empresa';

const CAMPAX_LOGO = '/logo-campax.png';

interface EmpresaLogoProps {
    empresa?: Pick<EmpresaPublica, 'logo_url' | 'nome_exibicao'> | null;
    className?: string;
}

/** The funerária's logo, falling back to the Campax logo when it has none or the image fails. */
export function EmpresaLogo({ empresa, className }: EmpresaLogoProps) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const logoUrl = empresa?.logo_url && empresa.logo_url !== failedUrl ? empresa.logo_url : null;

    return (
        <img
            src={logoUrl ?? CAMPAX_LOGO}
            alt={logoUrl ? `Logo ${empresa!.nome_exibicao}` : 'Logo Campax'}
            className={className}
            onError={() => logoUrl && setFailedUrl(logoUrl)}
        />
    );
}

/** Discreet credit shown on public pages branded with a funerária's identity (B4). */
export function TransmissaoPorCampax({ className = '' }: { className?: string }) {
    return (
        <p className={`text-xs text-center opacity-60 ${className}`}>
            Transmissão por <span className="font-medium">Campax</span>
        </p>
    );
}
