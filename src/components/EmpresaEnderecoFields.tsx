import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnderecoForm, UFS } from '@/lib/empresaEndereco';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-muted-foreground mb-2">{label}</span>
      {children}
    </label>
  );
}

/** Address block for the empresa forms in /platform; renders inside a `sm:grid-cols-2` grid. */
export function EmpresaEnderecoFields({ value, onChange }: { value: EnderecoForm; onChange: (v: EnderecoForm) => void }) {
  const set = (key: keyof EnderecoForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });

  return (
    <>
      <h3 className="font-heading text-base sm:col-span-2 mt-2">Endereço</h3>
      <Campo label="CEP"><Input value={value.endereco_cep} onChange={set('endereco_cep')} inputMode="numeric" placeholder="00000-000" /></Campo>
      <Campo label="Logradouro"><Input value={value.endereco_logradouro} onChange={set('endereco_logradouro')} /></Campo>
      <Campo label="Número"><Input value={value.endereco_numero} onChange={set('endereco_numero')} /></Campo>
      <Campo label="Complemento"><Input value={value.endereco_complemento} onChange={set('endereco_complemento')} /></Campo>
      <Campo label="Bairro"><Input value={value.endereco_bairro} onChange={set('endereco_bairro')} /></Campo>
      <Campo label="Cidade"><Input value={value.endereco_cidade} onChange={set('endereco_cidade')} /></Campo>
      <div>
        <Label htmlFor="endereco-uf" className="block text-sm font-normal text-muted-foreground mb-2">UF</Label>
        <Select value={value.endereco_uf || undefined} onValueChange={(uf) => onChange({ ...value, endereco_uf: uf })}>
          <SelectTrigger id="endereco-uf"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
