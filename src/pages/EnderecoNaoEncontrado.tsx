import { CrossIcon } from '@/components/icons/MemorialIcons';

/** Subdomain of an empresa that doesn't exist or is suspended (spec 08). No branding on purpose. */
const EnderecoNaoEncontrado = () => (
  <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6 text-center">
    <img src="/logo-campax.png" alt="Logo Campax" className="w-32 h-32 object-contain mb-6" />
    <div className="mb-4"><CrossIcon /></div>
    <h1 className="font-heading text-2xl text-foreground mb-2">Endereço não encontrado</h1>
    <p className="text-muted-foreground max-w-sm">
      Confira o endereço recebido da funerária. Se o problema continuar, entre em contato com ela.
    </p>
  </div>
);

export default EnderecoNaoEncontrado;
