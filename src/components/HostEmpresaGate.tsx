import { ReactNode } from 'react';
import { useHostEmpresa } from '@/hooks/useHostEmpresa';
import EnderecoNaoEncontrado from '@/pages/EnderecoNaoEncontrado';

/** On a funerária's subdomain, waits for its branding and blocks unknown or suspended ones. */
export function HostEmpresaGate({ children }: { children: ReactNode }) {
  const { slug, isLoading, notFound } = useHostEmpresa();
  if (!slug) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="min-h-screen gradient-soft flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (notFound) return <EnderecoNaoEncontrado />;
  return <>{children}</>;
}
