# Perfil do falecido, sepultamento e localização Google

## Contexto

Hoje `velorios` guarda apenas dados operacionais da transmissão (nome do
falecido, datas de início/fim do velório, sala, responsável). Não há espaço
para informações memoriais (nascimento/falecimento, foto, uma mensagem de
homenagem única) nem para dados de sepultamento (cemitério, data). `sala_velorio`
tem endereço em campos separados, mas nenhum link de localização do Google
Maps. Nada disso existe hoje na página pública `VelorioViewing.tsx`.

Importante: `mensagem_homenagem` é **diferente** do mural de homenagens já
existente (tabela `velorio_homenagens`, componente `MuralHomenagens.tsx`),
onde cada visitante deixa sua própria mensagem. `mensagem_homenagem` é um
texto único, cadastrado pelo admin/família, tipo um epitáfio/biografia curta
sobre o falecido — este spec não mexe no mural.

## Objetivo

Adicionar ao cadastro do velório informações sobre o falecido (nascimento,
falecimento, foto, mensagem de homenagem) e sobre o sepultamento (data,
cemitério, link do Google Maps), mais um link de localização Google para a
sala de velório. Tudo opcional, tudo público na página de transmissão
(`/velorio/:id`).

## Escopo

### 1. Banco de dados

Nova migration `supabase/migrations/015_add_falecido_sepultamento.sql`.
(Há um plano aprovado mas não implementado para `015_add_sala_velorio_whatsapp.sql`
— ver `docs/superpowers/plans/2026-07-16-whatsapp-responsavel-sala.md`. Como
nenhum arquivo `015_*` existe ainda no repo, numeração é por ordem de
aplicação real: quem implementar primeiro fica com `015`; o outro deve
renumerar para `016` ao implementar.)

```sql
-- ============================================
-- CAMPAX - PERFIL DO FALECIDO E SEPULTAMENTO
-- Migration: 015_add_falecido_sepultamento
-- Description: Campos memoriais (nascimento, falecimento, foto, mensagem de
--   homenagem), dados de sepultamento e localização Google da sala.
-- ============================================

ALTER TABLE velorios
  ADD COLUMN data_nascimento DATE,
  ADD COLUMN data_falecimento DATE,
  ADD COLUMN mensagem_homenagem TEXT,
  ADD COLUMN foto_falecido TEXT,
  ADD COLUMN data_sepultamento DATE,
  ADD COLUMN local_sepultamento VARCHAR(255),
  ADD COLUMN google_maps_url_sepultamento TEXT;

COMMENT ON COLUMN velorios.mensagem_homenagem IS 'Texto único de homenagem cadastrado pelo admin/família (diferente do mural velorio_homenagens, onde cada visitante deixa sua própria mensagem)';
COMMENT ON COLUMN velorios.foto_falecido IS 'URL pública da foto no bucket de Storage falecido-fotos';
COMMENT ON COLUMN velorios.local_sepultamento IS 'Nome do cemitério/local de sepultamento, texto livre';

ALTER TABLE sala_velorio
  ADD COLUMN google_maps_url TEXT;

COMMENT ON COLUMN sala_velorio.google_maps_url IS 'Link do Google Maps para a sala de velório';

-- ============================================
-- STORAGE: bucket de fotos do falecido
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('falecido-fotos', 'falecido-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public pode ver fotos de falecidos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'falecido-fotos');

CREATE POLICY "Operador+ pode enviar fotos de falecidos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode atualizar fotos de falecidos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'))
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode remover fotos de falecidos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'));
```

Nenhuma mudança nas policies de `velorios`/`sala_velorio`: ambas já usam
`SELECT *` para público e `UPDATE`/`INSERT` completos para autenticado
(padrão de `011_update_rls.sql`/`013_add_sala_velorio.sql`), então as
colunas novas ficam expostas automaticamente.

Sem constraints de obrigatoriedade ou validação cruzada de datas (ex:
falecimento antes do início do velório, sepultamento depois do falecimento)
— todos os campos são opcionais e podem ser preenchidos/corrigidos a
qualquer momento após a criação.

### 2. Upload de foto — `src/services/storageService.ts` (novo arquivo)

```ts
export async function uploadFotoFalecido(velorioId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${velorioId}/foto.${ext}`;
  const { error } = await supabase.storage
    .from('falecido-fotos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('falecido-fotos').getPublicUrl(path);
  return data.publicUrl;
}
```

Caminho fixo `{velorioId}/foto.{ext}` com `upsert: true`: substituir a foto
não acumula arquivos órfãos no bucket. Sem função de remoção separada —
trocar a foto já sobrescreve; não há requisito de "remover sem substituir".

### 3. Hooks — `useVelorios.ts` / `useSalasVelorio.ts`

**`useVelorios.ts`**
- `Velorio` e `VelorioFormData`: adicionar os 7 campos novos de `velorios`
  como `string | null` opcionais (mesmo padrão de
  `responsavel_velorio_nome`).
- Dentro do tipo aninhado `sala_velorio?`, adicionar `google_maps_url?: string | null`.
- Em `VELORIO_SELECT`, adicionar `google_maps_url` à lista de colunas do
  bloco `sala_velorio (...)`.
- `updateVelorio` já aceita `Partial<VelorioFormData>` — usado tanto para o
  submit normal quanto para o update pontual de `foto_falecido` após o
  upload (ver seção 4), sem mudança de assinatura.

**`useSalasVelorio.ts`**
- `SalaVelorio` e `SalaVelorioFormData`: adicionar
  `google_maps_url: string | null` / `google_maps_url?: string | null`.
  Como o hook faz `select('*')`/insert/update do objeto inteiro, nenhuma
  outra mudança é necessária.

### 4. Tela admin — `VelorioManagement.tsx`

`VelorioFormData` (interface local) e os dois `setFormData` de reset
(`openCreateDialog`/`openEditDialog`) ganham os 7 campos novos como string
(`''` quando vazio, convertendo `null` → `''` do mesmo jeito que
`responsavel_velorio_nome`). Adiciona também um estado local
`fotoFile: File | null` (não é campo do formData — é o arquivo pendente de
upload) e `fotoPreviewUrl: string` (para o preview: URL existente ou
`URL.createObjectURL` do arquivo escolhido).

No corpo do dialog, após o bloco de "WhatsApp do Responsável" (antes do
bloco de Token de Acesso), duas novas seções, separadas por um
`<hr className="border-border" />` ou título de subseção
(`<h3 className="text-sm font-medium text-foreground">`) para diferenciar
visualmente de "dados operacionais":

**Sobre o falecido**
- Data de Nascimento / Data de Falecimento: `grid grid-cols-2 gap-4`,
  `Input type="date"` cada.
- Foto: `Input type="file" accept="image/*"` + preview circular (mesmo
  raio usado no `Avatar` de `getInitials`, ~64px) quando há
  `fotoPreviewUrl`, com um botão "Remover" (ícone `X`) que limpa
  `fotoFile`/`fotoPreviewUrl` sem apagar do Storage (só desfaz a seleção
  pendente; trocar a foto por outra basta escolher um novo arquivo).
- Mensagem de Homenagem: `Textarea` (componente `@/components/ui/textarea`,
  já usado em outros formulários shadcn do projeto), placeholder tipo
  "Um trecho especial sobre a vida de [nome]...".

**Sepultamento**
- Data de Sepultamento: `Input type="date"`.
- Local/Cemitério: `Input` texto livre, placeholder "Nome do cemitério".
- Link do Google Maps: `Input` texto livre, placeholder
  "https://maps.google.com/...".

**`handleSave`** passa a:
1. Montar `velorioData` incluindo os 6 campos de texto novos (tudo exceto
   `foto_falecido`, que depende do upload) do mesmo jeito que os campos
   existentes (`|| undefined` quando vazio).
2. Criar ou atualizar o velório como já faz hoje, obtendo `id` (de
   `editingVelorioId` ou do retorno de `createVelorio.mutateAsync`).
3. Se houver `fotoFile` pendente: `await uploadFotoFalecido(id, fotoFile)`
   e então `await updateVelorio.mutateAsync({ id, data: { foto_falecido: url } })`.
4. Segue o fluxo existente (dialog de sucesso na criação, fechar dialog na
   edição) sem mudanças.

Erro de upload: se `uploadFotoFalecido` falhar, o velório já foi
criado/atualizado com os outros campos — mostra toast de erro específico
("Velório salvo, mas a foto não pôde ser enviada") em vez de abortar o
fluxo todo, já que os dados de texto já foram persistidos com sucesso.

### 5. Tela admin — `SalaManagement.tsx`

`SalaFormData`/`emptyForm` ganham `google_maps_url: string`.
`openEditDialog` preenche `google_maps_url: sala.google_maps_url ?? ''`.
No formulário, um novo `Input` "Link do Google Maps" logo abaixo do bloco
de endereço (após Cidade/Estado, antes de Responsável), mesmo padrão visual
dos demais campos de texto da tela.

### 6. Página pública — `VelorioViewing.tsx`

- **Foto**: se `velorio.foto_falecido` existir, renderiza uma
  `<img>` circular (mesmo tamanho ~48-64px do círculo com `CrossIcon` atual)
  no lugar do ícone de cruz no cabeçalho memorial; senão mantém o
  `CrossIcon` como está hoje.
- **Linha de vida**: logo abaixo do nome do falecido, se houver
  `data_nascimento` **ou** `data_falecimento` (pelo menos um), uma linha
  `text-cream/60 text-sm` no formato `12/03/1950 — 15/07/2026` (usa
  `toLocaleDateString('pt-BR')` em cada data presente; se só uma existir,
  mostra só ela, sem travessão solto).
- **Mensagem de homenagem**: se `velorio.mensagem_homenagem` existir, um
  parágrafo `italic text-cream/80` abaixo da linha de vida, estilo citação
  (aspas via CSS `before`/`after` ou literal `"..."`).
- **Localização da sala**: no bloco que já mostra `enderecoCompleto`
  (linha ~118-122), se `sala?.google_maps_url` existir, um link "Ver no
  Google Maps" (`target="_blank" rel="noopener noreferrer"`, ícone
  `MapPin` de `lucide-react`) ao lado do endereço.
- **Bloco de Sepultamento**: novo card/seção (mesmo estilo visual dos
  outros blocos informativos da página, ex. `bg-primary/50 rounded-lg p-4`)
  que só renderiza se **algum** dos três campos
  (`data_sepultamento`/`local_sepultamento`/`google_maps_url_sepultamento`)
  estiver preenchido. Mostra os que existirem: data formatada, nome do
  local, e link "Ver no Google Maps" se houver URL. Posição: logo após o
  bloco do cabeçalho memorial (nome + linha de vida + mensagem), antes do
  layout de duas colunas (vídeos + mural).

Ícones novos usados (`MapPin`) somam ao import já existente de
`lucide-react` no topo do arquivo.

## Fora de escopo

- Validação de formato de URL do Google Maps (texto livre, mesmo padrão
  dos outros campos de link/contato do projeto).
- Redimensionamento/otimização de imagem no upload (envia o arquivo como
  está; navegador limita pelo `accept="image/*"`).
- Mapa embutido (iframe) — só o link "Ver no Google Maps" que abre em nova
  aba.
- Cemitério como entidade reutilizável — `local_sepultamento` é texto livre
  por velório, sem tela de cadastro própria.
- Qualquer mudança no mural de homenagens (`velorio_homenagens`,
  `MuralHomenagens.tsx`) — `mensagem_homenagem` é um campo novo e
  independente.
- Exclusão de fotos antigas do bucket ao trocar (o `upsert` no mesmo
  caminho já evita acúmulo; não há necessidade de limpeza adicional).

## Teste

- Criar um velório preenchendo nascimento, falecimento, foto, mensagem de
  homenagem e sepultamento completo: confirmar que tudo salva e aparece
  corretamente na página pública (`/velorio/:id`).
- Editar um velório existente trocando a foto: confirmar que a nova foto
  substitui a antiga (mesmo caminho no bucket) e reflete na página pública.
- Criar/editar um velório deixando todos os campos novos em branco:
  confirmar que a página pública não mostra nenhum bloco vazio, link
  quebrado ou "undefined" (linha de vida, mensagem, sepultamento e link de
  localização somem completamente).
- Preencher só `google_maps_url` na sala (`/admin/salas`): confirmar que o
  link "Ver no Google Maps" aparece na página pública mesmo sem os outros
  campos novos preenchidos.
- Preencher só um dos três campos de sepultamento (ex: só o cemitério):
  confirmar que o bloco de Sepultamento aparece mostrando apenas esse dado.
- Testar upload de foto como usuário sem role `operador` (se aplicável no
  ambiente de teste): confirmar que a política de Storage bloqueia o
  envio.
