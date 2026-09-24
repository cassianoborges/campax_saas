import { useEffect } from 'react';
import { brandingVariables, BrandColors } from '@/lib/branding';

/**
 * Applies a funerária's colors while the calling component is mounted, and removes them on
 * unmount so the next page (e.g. going back to the token screen) is Campax-branded again.
 * `target` lets the platform panel preview colors inside a container instead of the whole page.
 */
export function useBranding(empresa: BrandColors | null | undefined, target?: HTMLElement | null) {
    const cor_primaria = empresa?.cor_primaria ?? null;
    const cor_secundaria = empresa?.cor_secundaria ?? null;

    useEffect(() => {
        const element = target ?? document.documentElement;
        const vars = brandingVariables({ cor_primaria, cor_secundaria });
        for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
        return () => {
            for (const name of Object.keys(vars)) element.style.removeProperty(name);
        };
    }, [cor_primaria, cor_secundaria, target]);
}

/** Sets document.title while mounted and restores the previous title afterwards. */
export function useDocumentTitle(title: string | null | undefined) {
    useEffect(() => {
        if (!title) return;
        const previous = document.title;
        document.title = title;
        return () => {
            document.title = previous;
        };
    }, [title]);
}
