import { EmpresaEndereco } from '@/hooks/usePlatform';

export type EnderecoForm = { [K in keyof EmpresaEndereco]: string };

export const ENDERECO_CAMPOS: (keyof EmpresaEndereco)[] = [
  'endereco_cep', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento',
  'endereco_bairro', 'endereco_cidade', 'endereco_uf',
];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function enderecoForm(empresa?: EmpresaEndereco): EnderecoForm {
  const form = {} as EnderecoForm;
  for (const key of ENDERECO_CAMPOS) form[key] = empresa?.[key] ?? '';
  return form;
}

/** Trimmed values for the API; blank → null. */
export function enderecoParaApi(form: EnderecoForm): EmpresaEndereco {
  const endereco = {} as EmpresaEndereco;
  for (const key of ENDERECO_CAMPOS) endereco[key] = form[key].trim() || null;
  return endereco;
}
