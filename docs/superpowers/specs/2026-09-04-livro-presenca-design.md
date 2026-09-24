# Livro de Presença (Registrar Homenagem pelo link público) — Design

**Data:** 2026-09-04
**Status:** Aprovado para plano de implementação

## Contexto

O Campax já tem, sem que o pedido original soubesse, boa parte da infraestrutura
para isso:

- `velorio_visitantes` (migration 006) — tabela que registra Nome, Celular
  (WhatsApp) e E-mail de quem se identifica para um velório. O próprio
  componente `VisitantesCounter.tsx` já chama essa lista de "Livro de
  Presenças" numa `Sheet`.
- `velorio_homenagens` (migration 008) — mural de homenagens (Parentesco +
  Mensagem), lido/gravado por `MuralHomenagens.tsx` dentro de
  `VelorioViewing.tsx`, com realtime via `postgres_changes`.
- `terms_acceptances` (migration 020) — aceite de Termos de Uso, hoje só
  disparado no fluxo de entrada por token em `PublicAccess.tsx`.
- `usePresence` (canal Realtime `presence:{velorio_id}`) — "quem está online
  agora", usado só por `OnlineCounter.tsx` dentro de `VelorioViewing.tsx`.
  Não tem relação com `velorio_visitantes`.

O pedido: um botão público "Registrar Homenagem", acessível **sem token**,
que primeiro identifica a pessoa (Nome completo, Celular/WhatsApp, E-mail) e
depois coleta Parentesco + Homenagem, sem que a pessoa veja quem mais
registrou presença ou está online — ela só vê a confirmação do próprio
registro.

## Escopo

Incluído:
- Botão "Registrar Homenagem" em `SalaPublicLink.tsx`
  (`/:hashEmpresa/:salaSlug`), visível quando há velório `atual` ou
  `próximo`.
- Diálogo de 3 telas (Identificação → Homenagem → Sucesso), sem exigir
  token nem passar pela tela `VelorioViewing`.
- Reaproveitamento total de `velorio_visitantes`, `velorio_homenagens` e
  `terms_acceptances` — nenhuma tabela ou policy nova.
- Extração de `getSavedVisitor`/`saveVisitor`/`VISITOR_KEY` (hoje duplicados
  em `PublicAccess.tsx` e `MuralHomenagens.tsx`) para
  `src/lib/visitorStorage.ts`, usado pelos três lugares.

Fora de escopo (decidido com o usuário):
- Mostrar a lista de homenagens ou de presenças na própria `SalaPublicLink`
  — quem registra por ali só vê a própria confirmação, nunca o Mural ou
  quem está online. O Mural continua existindo só dentro de
  `VelorioViewing.tsx`.
- Registrar homenagem depois que o velório encerrou — `SalaPublicLink` já
  só exibe `atual`/`próximo`; velório encerrado cai em "Nenhum velório em
  andamento", sem alteração desse comportamento.
- Nova tela de moderação/relatório admin — a exclusão de homenagens já
  existe (policy `Admin delete homenagens`).
- Deduplicação ou limite de homenagens por pessoa — mesmo padrão do Mural
  atual (sem restrição).

## Arquitetura

### 1. Utilitário compartilhado — `src/lib/visitorStorage.ts`

```ts
const VISITOR_KEY = 'campax_visitor';

export interface SavedVisitor {
  nome: string;
  celular: string;
  email: string;
}

export function getSavedVisitor(): SavedVisitor | null { /* ... */ }
export function saveVisitor(data: SavedVisitor): void { /* ... */ }
```

`PublicAccess.tsx` e `MuralHomenagens.tsx` passam a importar daqui em vez de
duplicar a implementação local. Comportamento inalterado.

### 2. Novo componente — `src/components/RegistrarHomenagemDialog.tsx`

Props: `velorio_id: string`, `velorio_nome: string`, `trigger: ReactNode`.

Estado interno `step: 'identificacao' | 'homenagem' | 'sucesso'`, inicializado
lendo `getSavedVisitor()` (pré-preenche nome/celular/email se existir, mesmo
padrão de `PublicAccess.tsx`).

**Tela `identificacao`** (mesmo layout/validação de "Identificação do
Visitante" em `PublicAccess.tsx`):
- Campos: Nome completo* (`Input`), Celular (WhatsApp)* (`Input type=tel`),
  E-mail (`Input type=email`, opcional).
- Checkbox de aceite dos Termos de Uso + `TermsDialog` reaproveitado (mesmo
  componente).
- Validação ao avançar: nome não vazio; celular com 10+ dígitos
  (`replace(/\D/g,'')`); checkbox marcado — mesmas mensagens de erro de
  `PublicAccess.tsx`.
- Se `getSavedVisitor()` já tinha dado no localStorage, ainda assim verifica
  `hasAcceptedCurrentTerms(celular)` — se `true`, pula a checkbox de termos
  (mesma lógica de reaceite de `PublicAccess.tsx`); se `false`, exibe.
- Ao confirmar: `Promise.all([registerVisitante({velorio_id, ...}),
  recordTermsAcceptance({velorio_id, ...})])` (só quando o aceite era
  necessário) → `saveVisitor(...)` → avança para `homenagem`.

**Tela `homenagem`** (mesmo padrão de `MuralHomenagens.tsx`):
- Campos: Parentesco (`Input`, opcional, mesmo `maxLength={30}`), Mensagem
  (`Textarea`, obrigatória, mesmo `maxLength={500}`).
- Ao confirmar: `submitHomenagem({ velorio_id, autor_nome: nome,
  parentesco, mensagem })` → avança para `sucesso`.

**Tela `sucesso`**:
- "Homenagem registrada. Obrigado por prestar seus respeitos." + nome do
  falecido (`velorio_nome`).
- Botão "Fechar" → fecha o `Dialog` (`onOpenChange(false)`), reseta o estado
  interno para `identificacao` (dados de identificação continuam vindo do
  localStorage na próxima abertura). A pessoa permanece em
  `SalaPublicLink` — não há navegação para `VelorioViewing` em nenhum
  momento deste fluxo.

Sem chamada a `logVelorioAccess` (é específico do fluxo de entrada por
token) nem a `usePresence` (canal de "quem está online" só existe dentro de
`VelorioViewing`/`OnlineCounter`) — por isso quem registra pelo link
público nunca aparece como "online" nem vê quem está.

### 3. `SalaPublicLink.tsx`

Adiciona, abaixo do bloco de `atual`/`próximo`:

```tsx
<RegistrarHomenagemDialog
  velorio_id={velorio.id}
  velorio_nome={velorio.nome_falecido}
  trigger={<Button variant="gold" className="w-full mt-3">Registrar Homenagem</Button>}
/>
```

## Testes

Sem endpoint Express novo (RLS + insert direto). Validação manual via skill
`run`:

1. Botão "Registrar Homenagem" aparece em `/:hashEmpresa/:salaSlug` quando
   há velório atual ou próximo; some quando não há nenhum.
2. Tela de identificação bloqueia avanço sem nome, sem celular válido, ou
   sem aceite dos termos; ao completar, cria 1 linha em
   `velorio_visitantes` e 1 em `terms_acceptances`.
3. Tela de homenagem: enviar parentesco+mensagem cria 1 linha em
   `velorio_homenagens`; tela de sucesso aparece; ao fechar, volta para
   `SalaPublicLink` (sem navegar para `/velorio/:id`).
4. Verificação técnica (não faz parte do fluxo do visitante): abrir
   `VelorioViewing` do mesmo velório em outra aba, como um terceiro já
   identificado, confirma que a homenagem aparece no Mural em tempo real —
   prova que o insert foi feito corretamente, sem expor nada disso para
   quem só registrou pelo link público.
5. Reabrir o diálogo (mesmo navegador) pula a tela de identificação
   preenchida e, se os termos já foram aceitos com a versão vigente, pula
   direto para a tela de homenagem sem exigir novo aceite.

## Restrições

- Nenhuma tabela, coluna ou policy nova — todo o armazenamento reaproveita
  `velorio_visitantes`, `velorio_homenagens` e `terms_acceptances` como já
  existem hoje.
- O fluxo nunca navega para `/velorio/:id` nem expõe o Mural, a lista de
  presenças ou o contador de "online" para quem registra pelo link
  público.
