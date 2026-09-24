# Banco de Homenagens (mensagens reutilizáveis)

## Contexto

Hoje o campo "Mensagem de Homenagem" do cadastro de velório
(`VelorioManagement.tsx`, `mensagem_homenagem`) é uma `Textarea` de texto
livre — cada velório exige digitar a mensagem do zero. Não existe nenhuma
tela de "Configurações" no admin hoje (`src/App.tsx` só tem Dashboard,
Salas, Câmeras, Velórios, Relatórios e Usuários).

Importante: isso é **diferente** do mural de homenagens já existente
(tabela `velorio_homenagens`, hook `useHomenagens.ts`, serviço
`homenagensService.ts`, componente `MuralHomenagens.tsx`), onde cada
**visitante** deixa sua própria mensagem em um velório específico. Este
spec cria um **banco de templates administrativos** reutilizáveis entre
velórios — por isso os novos hook/serviço/tabela usam o nome
`homenagens_templates` (não `homenagens`), para não colidir nem se
confundir com o mural.

## Objetivo

Criar uma seção de Configurações no admin contendo um CRUD de "Banco de
Homenagens" (mensagens-modelo reutilizáveis, cada uma com um título curto
e o texto completo). No cadastro de velório, adicionar um dropdown que
lista essas mensagens por título; ao escolher uma, o texto é copiado para
a Textarea existente, que continua editável. O dropdown também tem uma
opção para abrir o cadastro de homenagens em nova aba, sem perder o
progresso do formulário de velório aberto.

## Escopo

### 1. Banco de dados — `supabase/migrations/017_add_homenagens_templates.sql`

```sql
CREATE TABLE homenagens_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     VARCHAR(255) NOT NULL,
  mensagem   TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE homenagens_templates IS 'Mensagens de homenagem reutilizáveis, cadastradas pelo admin e escolhidas via dropdown no cadastro de velório (diferente do mural velorio_homenagens, onde cada visitante escreve a própria mensagem)';

CREATE TRIGGER update_homenagens_templates_updated_at BEFORE UPDATE ON homenagens_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE homenagens_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewer+ pode ler banco de homenagens"
  ON homenagens_templates FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Admin+ pode criar mensagens no banco de homenagens"
  ON homenagens_templates FOR INSERT TO authenticated
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode editar mensagens no banco de homenagens"
  ON homenagens_templates FOR UPDATE TO authenticated
  USING (user_has_role('admin'))
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode excluir mensagens no banco de homenagens"
  ON homenagens_templates FOR DELETE TO authenticated
  USING (user_has_role('admin'));
```

Sem policy pública — esta tabela nunca é lida pelo visitante (só usada
dentro do admin). `user_has_role` já existe desde `010_add_rbac.sql`,
`update_updated_at_column` já existe desde `001_initial_schema.sql`.

Nenhuma constraint de unicidade em `titulo` — dois templates podem ter o
mesmo título sem problema, é só um rótulo de exibição.

### 2. Hook — `src/hooks/useHomenagensTemplates.ts` (novo arquivo)

Mesmo padrão de `useCameras.ts`: `useQuery(['homenagens_templates'])`
ordenado por `titulo` (ordem alfabética, mais previsível num dropdown do
que `created_at`), `useMutation` para create/update/delete, cada um
invalidando `['homenagens_templates']` e disparando toast de
sucesso/erro.

```ts
export interface HomenagemTemplate {
    id: string;
    titulo: string;
    mensagem: string;
    created_at: string;
    updated_at: string;
}

export interface HomenagemTemplateFormData {
    titulo: string;
    mensagem: string;
}
```

Exporta `useHomenagensTemplates()` retornando
`{ templates, isLoading, error, createTemplate, updateTemplate, deleteTemplate }`.

### 3. Tela de Configurações — `src/pages/SettingsHub.tsx` (novo arquivo)

Hub simples espelhando `ReportsHub.tsx`: cabeçalho com botão "Voltar" para
`/admin/dashboard`, um `Card` "Sobre Configurações", e um grid de cards
clicáveis — hoje com um único item:

```ts
{
  id: 'homenagens',
  title: 'Banco de Homenagens',
  description: 'Mensagens de homenagem reutilizáveis para o cadastro de velórios',
  icon: MessageSquareHeart, // lucide-react
  route: '/admin/configuracoes/homenagens',
}
```

Estrutura pronta para receber mais cards de configuração no futuro sem
refatoração (mesmo array-map de `ReportsHub`).

### 4. Tela de CRUD — `src/pages/HomenagensTemplatesManagement.tsx` (novo arquivo)

Mesmo padrão de `CameraManagement.tsx`:
- `AdminLayout activeSection="configuracoes"`.
- Botão "Nova Mensagem" (só visível se `isAdmin`) abre `Dialog` com dois
  campos: `Input` "Título" (placeholder "Ex: Mensagem para idosos") e
  `Textarea` "Mensagem" (placeholder "Texto completo da homenagem...").
- Lista abaixo em `Card`s: título em negrito, mensagem truncada
  (`line-clamp-2` ou similar), botões de editar/excluir (ícones `Pencil`/
  `Trash2`) visíveis só se `isAdmin`; `confirm()` nativo antes de excluir,
  igual ao padrão de `handleDelete` em `CameraManagement.tsx`.
- Estado vazio: texto "Nenhuma mensagem cadastrada" quando a lista estiver
  vazia (mesmo padrão visual do estado vazio de câmeras).

### 5. Navegação — `src/components/AdminLayout.tsx`

- `ActiveSection` ganha `'configuracoes'`.
- Novo item de nav "Configurações" (ícone `Settings` de `lucide-react`),
  gated por `isAdmin` (buscado de `useAuth()`, já exposto no hook):
  ```tsx
  {isAdmin && navItem('configuracoes', 'Configurações', '/admin/configuracoes', Settings)}
  ```
  Posicionado depois de "Relatórios" e antes de "Usuários" (ordem de
  privilégio crescente, mesmo critério informal já usado hoje).

### 6. Rotas — `src/App.tsx`

```tsx
<Route path="/admin/configuracoes" element={<ProtectedRoute requiredRole="admin"><SettingsHub /></ProtectedRoute>} />
<Route path="/admin/configuracoes/homenagens" element={<ProtectedRoute requiredRole="admin"><HomenagensTemplatesManagement /></ProtectedRoute>} />
```

`requiredRole="admin"` no nível da rota gera redirect para quem não é
admin+ (mesmo padrão de `/admin/usuarios`). A tela de CRUD internamente
ainda escala os botões de escrita por `isAdmin` (redundante com a rota,
mas seguindo o padrão existente de dupla checagem UI + rota + RLS).

Note: como o dropdown de leitura (seção 7) precisa que operador **também**
leia a tabela, a política RLS de `SELECT` é `viewer+` (não `admin+`) —
só a rota/tela de gerenciamento é restrita a admin+, a leitura via hook é
mais permissiva.

### 7. Integração no cadastro de velório — `VelorioManagement.tsx`

Acima da `Textarea` "Mensagem de Homenagem" existente (linhas ~585-591),
um novo `Select` (shadcn, `@/components/ui/select`):

```tsx
<div>
  <label className="block text-sm text-muted-foreground mb-2">
    Escolher do banco de homenagens
  </label>
  <Select
    value=""
    onValueChange={(value) => {
      if (value === '__nova__') {
        window.open('/admin/configuracoes/homenagens', '_blank');
        return;
      }
      const template = templates.find((t) => t.id === value);
      if (template) {
        setFormData({ ...formData, mensagem_homenagem: template.mensagem });
      }
    }}
  >
    <SelectTrigger>
      <SelectValue placeholder="Selecionar uma mensagem pronta (opcional)" />
    </SelectTrigger>
    <SelectContent>
      {templates.map((t) => (
        <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>
      ))}
      <SelectItem value="__nova__">+ Adicionar nova mensagem</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- `value=""` fixo no `Select` (não é um campo controlado do `formData`):
  ele é só um "atalho de preenchimento", não guarda estado próprio — depois
  de escolher, o valor exibido/editável vive só na `Textarea` abaixo.
- Escolher "+ Adicionar nova mensagem" abre a tela de CRUD em nova aba
  (`window.open(..., '_blank')`) sem fechar ou alterar o dialog de
  cadastro do velório em andamento. A lista de templates só atualiza na
  aba original quando o hook refizer o fetch (próxima abertura do dialog,
  ou pode-se chamar `refetch()` — deixado fora de escopo um refresh
  automático em tempo real via realtime channel, ver "Fora de escopo").
- Nenhuma mudança em `VelorioFormData`, `Velorio` (hook `useVelorios.ts`)
  ou na página pública `VelorioViewing.tsx` — `mensagem_homenagem`
  continua sendo uma string simples, venha ela de um template ou digitada
  na mão.
- `VelorioManagement.tsx` importa `useHomenagensTemplates` e usa
  `templates` (lista) só para popular o `Select`; não precisa dos
  mutations de create/update/delete (isso fica na tela de CRUD).

## Fora de escopo

- Edição/exclusão de templates a partir da tela de velório — isso só
  existe na tela de gerenciamento (`/admin/configuracoes/homenagens`).
- Atualização em tempo real (realtime) da lista de templates na aba do
  cadastro de velório quando um novo template é criado na outra aba — o
  admin reabre o dropdown ou reabre o dialog para ver o novo item (sem
  necessidade de subscription, dado que é um fluxo raro/manual).
- Qualquer mudança no mural de homenagens (`velorio_homenagens`,
  `useHomenagens.ts`, `MuralHomenagens.tsx`) — são features independentes.
- Categorização/busca/paginação no banco de homenagens — lista simples,
  sem volume esperado que justifique isso.
- Outras seções dentro de "Configurações" além de Banco de Homenagens —
  a estrutura do hub (`SettingsHub.tsx`) fica pronta para receber mais
  cards, mas nenhuma outra seção é criada agora.

## Teste

- Como admin: acessar `/admin/configuracoes`, ver o card "Banco de
  Homenagens", entrar, criar uma mensagem (título + texto), editar,
  excluir — confirmar toasts e persistência (refresh da página).
- Como operador (sem ser admin): confirmar que `/admin/configuracoes` e
  `/admin/configuracoes/homenagens` redirecionam (rota protegida por
  `requiredRole="admin"`), e que o item "Configurações" não aparece na
  sidebar.
- Como operador: abrir o cadastro de novo velório e confirmar que o
  dropdown "Escolher do banco de homenagens" aparece populado com os
  títulos cadastrados (mesmo sem acesso à tela de gerenciamento) — valida
  a policy `SELECT` de `viewer+`.
- Selecionar um template no dropdown: confirmar que o texto aparece na
  Textarea "Mensagem de Homenagem" e continua editável (alterar o texto
  depois de escolher e salvar — confirmar que o texto editado, não o
  original do template, é o que persiste no velório).
- Escolher "+ Adicionar nova mensagem": confirmar que abre
  `/admin/configuracoes/homenagens` em nova aba e que o dialog de
  cadastro do velório na aba original permanece aberto com os dados já
  preenchidos intactos.
- Criar um velório sem usar o dropdown (mensagem digitada na mão, como
  hoje): confirmar que nada quebrou no fluxo existente.
