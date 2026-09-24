# Responsividade mobile — Admin e Sala de Velório

## Contexto

O painel admin (`AdminLayout` + páginas Dashboard, Câmeras, Velórios, Salas,
Usuários) não tem nenhum tratamento para telas pequenas: a sidebar é fixa em
`w-64` e o conteúdo tem `ml-64` sempre aplicado. Em mobile isso quebra o
layout. A sala de velório (`VelorioViewing`) já tem boa parte da
responsividade feita, mas tem pontos pontuais a corrigir.

## Objetivo

Tornar o admin e a sala de velório utilizáveis em telas de celular, sem
alterar a navegação, funcionalidades ou o visual em desktop.

## Escopo

### 1. Sidebar do admin recolhível (`src/components/AdminLayout.tsx`)

- Desktop (`md` e acima): mantém o comportamento atual — sidebar fixa,
  sempre visível.
- Mobile (abaixo de `md`): sidebar vira um drawer off-canvas, oculta por
  padrão. Uma barra superior fixa (logo + botão hambúrguer) substitui a
  sidebar fixa. Tocar no hambúrguer abre a sidebar como overlay (usar o
  componente `Sheet` já existente em `src/components/ui/sheet.tsx`); tocar
  num item de navegação ou fora do drawer fecha o overlay.
- Nenhuma mudança nos itens de navegação, rotas ou lógica de permissão
  (`isSuperadmin`).

### 2. Headers das páginas admin

Arquivos: `AdminDashboard.tsx`, `CameraManagement.tsx`,
`VelorioManagement.tsx`, `SalaManagement.tsx`, `UserManagement.tsx`.

- Trocar `flex items-center justify-between` dos headers por
  `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`
  (ou equivalente), para o título empilhar acima do botão de ação em vez
  de espremer na mesma linha.

### 3. Linhas de ação nos cards de listagem

Arquivos: `CameraManagement.tsx`, `VelorioManagement.tsx`,
`SalaManagement.tsx`, `UserManagement.tsx`.

- Cards com `flex items-center justify-between` contendo texto + vários
  botões de ícone: permitir quebra (`flex-wrap`) e empilhar em coluna
  abaixo de `sm` quando necessário, mantendo o layout horizontal atual em
  telas maiores.

### 4. Botões visíveis só no hover

Arquivos: `VelorioManagement.tsx` (excluir homenagem) e
`VelorioViewing.tsx` (botão de tela cheia por câmera).

- Trocar `opacity-0 group-hover:opacity-100` por uma versão que também
  mostra o botão por padrão em telas touch, ex.:
  `opacity-100 md:opacity-0 md:group-hover:opacity-100`, já que hover não
  existe em touch.

### 5. Header da sala de velório (`VelorioViewing.tsx`)

- Ajustar o header (`ArrowLeft` / contador+status / compartilhar) para
  permitir quebra de linha (`flex-wrap`, `gap`) em telas muito estreitas,
  em vez de espremer os três blocos numa única linha.

## Fora de escopo

- Qualquer mudança de funcionalidade, rotas, permissões ou dados.
- Redesenho visual do desktop (deve permanecer pixel-idêntico).
- Páginas de relatórios específicas não revisadas em detalhe
  (`AccessLogsTable`, etc.) além do que já herdam do `AdminLayout`.

## Teste

- Verificação manual via devtools (viewport ~375px e ~768px) em cada
  página admin e na sala de velório: sidebar abre/fecha, headers não
  cortam texto, botões de ação acessíveis sem hover, nenhuma regressão
  visual em desktop (≥1024px).
