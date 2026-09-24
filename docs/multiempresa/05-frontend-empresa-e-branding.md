# Spec 05 — F4: Frontend com empresa e identidade visual

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [03-backend-isolamento.md](03-backend-isolamento.md)
> (e de [04-plataforma.md](04-plataforma.md) para cadastrar a identidade visual) · Status: **implementada em 2026-09-23** e no ar em `app2` junto com F1 e F2

## Objetivo

Fazer o frontend deixar de assumir uma única empresa: links públicos com o hash da empresa certa,
páginas públicas com o **logo, o nome e as cores da funerária** e o painel da empresa mostrando de quem ele é.
Também adapta o frontend às mudanças de API da F2. Esta fase sobe **junto** com a F1 e a F2.

## Contexto (verificado no código em 2026-09-23)

- `src/lib/empresaHash.ts` exporta `VITE_EMPRESA_HASH` (fixado no build). É usado em `SalaManagement.tsx` (montar e
  copiar o link público) e em `SalaPublicLink.tsx` (comparar com o hash da URL).
- `useSalaPublicLink` chama `GET /public/salas/:slug`, que a F2 remove.
- `termsAcceptanceService.hasAcceptedCurrentTerms(celular)` não manda `velorio_id`, que a F2 torna obrigatório.
  Os dois chamadores (`PublicAccess.tsx:111` e `RegistrarHomenagemDialog.tsx:68`) já têm o id na mão.
- **Bug em produção:** `VelorioViewing.tsx` usa `useVelorio(id)`, que chama a rota **autenticada**
  `GET /velorios/:id`. Visitante sem login recebe 401, e a página mostra "Velório não encontrado". A F2 cria
  `GET /public/velorios/id/:id` (spec 03, C12).
- Tema: tokens HSL em `src/index.css` (`--gold`, `--navy`, `--accent`, `--primary`, `--ring`, `--sidebar-*`) e
  `tailwind.config.ts`. São 124 usos de `gold` nas páginas e componentes. `--gradient-gold`, `--gradient-elegant` e
  `--shadow-glow` têm os valores HSL **escritos direto**, e não via `var(--gold)`/`var(--navy)`.
- Logo `/logo-campax.png` fixo em `PublicAccess.tsx`, `AdminLogin.tsx` e `AdminLayout.tsx` (2 lugares).
  `VelorioViewing` e `SalaPublicLink` não mostram logo.
- `index.html`: `<title>` e as tags `og:*` fixas ("Velório Online", logo Campax).
- O frontend não tem executor de testes; a verificação é `npm run build`, `npm run lint` e um checklist manual.

## Decisões desta spec

| # | Decisão |
|---|---------|
| B1 | **Cores da funerária só nas páginas públicas** (`PublicAccess` depois do token, `VelorioViewing`, `SalaPublicLink`, `RegistrarHomenagemDialog`). O **painel admin** mostra o logo e o nome da funerária, mas mantém as cores Campax, para garantir legibilidade e manter a identidade do produto para quem opera. |
| B2 | `cor_primaria` substitui o **dourado** (destaques, botões `gold`, anéis de foco); `cor_secundaria` substitui o **azul-marinho** (fundos escuros, gradiente elegante). Campo vazio = cor Campax. |
| B3 | A cor do texto sobre cada cor (`*-foreground`) é **calculada** pela luminância (claro ou escuro), para que uma cor clara escolhida pela funerária não deixe o texto do botão ilegível. |
| B4 | Páginas públicas com identidade da funerária mostram um rodapé discreto: **"Transmissão por Campax"**. *(Decisão comercial; pode ser removido por empresa no futuro, como parte de um plano "white-label".)* |
| B5 | `/` (digitar o token) e `/admin` (login) continuam com a identidade Campax, porque ainda não se sabe a empresa. Com subdomínio (F7), passam a saber. |
| B6 | Tags `og:*` (prévia de link no WhatsApp) continuam Campax: uma SPA não consegue mudá-las para os robôs das redes sociais. Isso exigiria renderização no servidor e fica fora de escopo. O `document.title` muda (aba do navegador). |

## Desenho

### 1. Tipos e dados da empresa

- `src/types/empresa.ts`: `EmpresaPublica = { id, nome_exibicao, slug, hash_publico, logo_url, cor_primaria, cor_secundaria, whatsapp_contato, email_contato }`.
- `useAuth`: `/auth/me` e `/auth/login` passam a retornar `{ profile, empresa }`. O hook expõe `empresa`
  (`null` para `platform_admin`). O cache do TanStack Query guarda os dois.
- `Velorio` (em `useVelorios.ts`) ganha `empresa?: EmpresaPublica` (vem nas respostas públicas).
- `SalaPublicLinkData` ganha `empresa: EmpresaPublica`.

### 2. Identidade visual — `src/lib/branding.ts` + `useBranding`

- `hexToHslTriplet('#C9A227') → '43 68% 47%'` (formato dos tokens do `index.css`).
- `foregroundFor(hex) → '222 35% 10%' | '40 30% 95%'`, pela luminância relativa (WCAG), escolhendo o que tiver
  maior contraste (B3).
- `useBranding(empresa | null | undefined)`: enquanto o componente estiver montado, aplica em
  `document.documentElement.style`:
  - `cor_primaria` → `--gold`, `--accent`, `--ring`, `--gold-light` (versão mais clara, +20% de luminosidade),
    `--accent-foreground`
  - `cor_secundaria` → `--navy`, `--primary`, `--navy-light`, `--primary-foreground`
  - Ao desmontar, **remove** as propriedades (volta ao `index.css`). Isso é importante porque um mesmo visitante
    pode ir de `/velorio/:id` para `/`.
- `index.css`: reescrever `--gradient-gold`, `--gradient-elegant` e `--shadow-glow` para usar `hsl(var(--gold))` /
  `hsl(var(--navy))`, e não os valores fixos, senão eles ignorariam a funerária. É uma mudança visual **nula** para a
  Campax, porque os valores padrão são os mesmos.
- **Prévia na F3**: a aba "Identidade visual" do `/platform` usa o mesmo `useBranding` num contêiner de prévia. Por
  isso, `useBranding` aceita um `target?: HTMLElement` (padrão: `document.documentElement`). A prévia também avisa se o
  contraste da `cor_primaria` com o fundo claro ficar abaixo de 3:1.

### 3. Componente `EmpresaLogo`

`<EmpresaLogo empresa={...} className=... />`: mostra `empresa.logo_url` com `alt={empresa.nome_exibicao}` e, sem
logo ou se a imagem falhar (`onError`), mostra `/logo-campax.png`. Substitui os `<img src="/logo-campax.png">` de
`PublicAccess` (só nos passos depois do token) e de `AdminLayout` (os 2 lugares). Entra também no topo de
`VelorioViewing` e de `SalaPublicLink`.

### 4. Páginas públicas

| Página | Mudanças |
|--------|----------|
| `PublicAccess.tsx` | Passo "token": sem mudança (Campax, B5). Depois que o token resolve, os passos "visitor" e "confirm" aplicam `useBranding(velorio.empresa)` e mostram `EmpresaLogo`. `hasAcceptedCurrentTerms(celular, velorio.id)`. Empresa suspensa → o backend já responde 404 → a mensagem de token inválido já existente aparece. |
| `VelorioViewing.tsx` | Troca `useVelorio(id)` por um novo `usePublicVelorio(id)` → `GET /public/velorios/id/:id` (**corrige o bug do 401**). `useBranding(velorio.empresa)`, `EmpresaLogo` no topo, rodapé B4, `document.title = "<nome_falecido> — <nome_exibicao>"`. |
| `SalaPublicLink.tsx` | Remove a comparação com `EMPRESA_HASH`; `useSalaPublicLink(hash, slug)` → `GET /public/empresas/:hash/salas/:slug`; 404 → `NotFound` (hash errado, sala de outra empresa e empresa suspensa caem aqui). `useBranding(data.empresa)`, `EmpresaLogo`, rodapé B4, `document.title = "<sala> — <nome_exibicao>"`. |
| `RegistrarHomenagemDialog.tsx` | `hasAcceptedCurrentTerms(celular, velorio_id)`. Herda as cores da página onde está aberto. |
| `termsAcceptanceService.ts` | `hasAcceptedCurrentTerms(celular, velorioId)` manda `velorio_id` na query. |

### 5. Painel da empresa

| Local | Mudança |
|-------|---------|
| `AdminLayout.tsx` | `EmpresaLogo` com `useAuth().empresa`; subtítulo "Velório Online" → `empresa.nome_exibicao` (mantém "Administração" embaixo). Cores Campax (B1). |
| `SalaManagement.tsx` | Link público = `${origin}/${empresa.hash_publico}/${slug}` (as 3 ocorrências). |
| `useRole.ts` / `ProtectedRoute` / `AdminLogin` | Ajustes de `platform_admin` descritos na spec 04 (a F3 depende deles; se a F4 for implementada antes, eles entram aqui). |

### 6. Limpeza

- Apagar `src/lib/empresaHash.ts` e remover `VITE_EMPRESA_HASH` do `.env` e do `.env.example`.
- **Antes de apagar**, confirmar que o valor dele está gravado como `hash_publico` da empresa inicial (critério da F1).
- CLAUDE.md: seção "Environment Variables" sem `VITE_EMPRESA_HASH`; seção "Frontend Routes" explicando que
  `:hashEmpresa` é resolvido pela API; mencionar `useBranding`/`EmpresaLogo`.
- O gerador de `hash_publico` (F3) deve evitar palavras que já são rotas do primeiro nível (`admin`, `platform`,
  `velorio`). A chance é mínima, mas o custo de evitar é uma linha.

## Verificação

`npm run build` e `npm run lint` sem erros novos. Checklist manual (vai na descrição da PR), com o backend da F2
apontando para o `campax_dev` migrado e uma **segunda empresa de teste** cadastrada via `/platform` com logo e cores
bem diferentes:

- [ ] **Link antigo:** `/<hash atual>/<slug de sala existente>` abre, com a identidade Campax (empresa inicial).
- [ ] Link de sala da empresa 2 abre com o logo e as cores dela; mesmo slug com o hash da empresa 1 mostra a sala da empresa 1.
- [ ] Hash inexistente → NotFound. Empresa 2 suspensa → NotFound no link de sala e "token inválido" em `/`.
- [ ] Token da empresa 2 em `/` → os passos seguintes com a identidade dela → `/velorio/:id` **abre sem login**
      (bug corrigido) com logo, cores, título da aba e rodapé.
- [ ] Voltar de `/velorio/:id` para `/` → cores Campax restauradas (nada de cor "presa").
- [ ] Aceite de termos: aceitar num velório da empresa 1 e depois abrir um velório da empresa 2 com o mesmo celular →
      pede o aceite de novo; um segundo velório da empresa 1 → não pede.
- [ ] Homenagem registrada pelo link da sala da empresa 2 aparece no mural em tempo real.
- [ ] Admin da empresa 2: logo e nome dela no menu, cores Campax; o link copiado em Salas usa o hash dela.
- [ ] Botões `gold` com uma `cor_primaria` bem clara (ex. `#F5F0C0`) têm texto escuro legível.
- [ ] Tudo em 375 px de largura.

## Notas da implementação (2026-09-23)

- **Token `--gold-foreground`:** o botão `gold` usava `text-primary-foreground`, que é o texto sobre o **azul-marinho**.
  Com as duas cores de uma funerária, o texto do botão seria calculado para a cor errada. Foi criado o token
  `--gold-foreground` (padrão idêntico ao anterior, inclusive no `.dark`) e as variantes `gold`/`outline-gold` de
  `components/ui/button.tsx` passaram a usá-lo. É a única edição em `components/ui/`; essas variantes são do projeto, não
  do shadcn. Também foram criados `--gold-gradient-end` e `--navy-gradient-end`, para que os gradientes continuem visualmente
  idênticos na Campax.
- **`TenantRole`** (`UserRole` sem `platform_admin`) nas telas de usuários: o `platform_admin` nunca aparece como opção.
- **`homePathFor(role)`** em `useRole.ts`, e `ProtectedRoute` com `scope` (itens da spec 04 que a F4 precisava). O
  `platform_admin` é mandado para `/platform`, que só existe depois da F3.
- **Bugs anteriores corrigidos no caminho:**
  - `data_nascimento`/`data_falecimento` chegam da API como `YYYY-MM-DDT00:00:00.000Z`: a página pública mostrava
    `10T00:00:00.000Z/05/1940` e o formulário de edição abria vazio (10 velórios têm essas datas).
  - A página pública chamava `useVelorios()`, que buscava a lista **autenticada** `/velorios` (401 a cada visita). Agora
    ela só busca com login.
- **Mantido:** o PATCH `foto_falecido` depois do upload (o backend o ignora, mas ele dispara a atualização da lista).
- **`refresh-dev-db.sh`** passou a usar `d2788b07` como `HASH_PUBLICO` padrão (antes lia o `VITE_EMPRESA_HASH`).
- **Verificação no navegador** (Playwright/Chromium em `app2.campax.com.br`, com uma funerária de teste com
  `#2E8B57`/`#4B1D3F`, removida em seguida): token → identificação com o nome e as cores dela → aceite dos termos →
  `/velorio/:id` sem login, com cores, logo (Campax como fallback), título da aba, datas corretas e rodapé; depois de sair,
  o botão de `/` volta ao dourado Campax; na segunda visita não pede os termos de novo; o link de sala da funerária abre
  com a identidade dela (desktop e 375 px); o link antigo `/d2788b07/<slug>` abre com a marca Campax; o hash da Campax com
  o slug da outra empresa dá 404; o admin mostra "Campax", só as salas dela e os links com `d2788b07`; nenhuma resposta
  ≥ 400 do backend no fluxo do visitante; o visitante, o aceite e o log ficaram gravados com a empresa certa.
- **Não verificado:** logo enviado (o upload vem na F3; testado só o fallback), cor primária muito clara e o fluxo pelo
  `RegistrarHomenagemDialog`.

## Fora de escopo

- Tags `og:*` por empresa (B6).
- Identificação da empresa pelo subdomínio (F7).
- Cores da funerária no painel admin (B1).
- Mudança no **texto** dos termos de uso (Q5; depende de revisão jurídica e gera nova versão de termos).
- Fontes personalizadas por empresa.

## Critérios de aceite

- [x] Nenhuma referência a `VITE_EMPRESA_HASH`/`EMPRESA_HASH` no código (sobram só os documentos históricos em `docs/superpowers/`).
- [ ] Checklist manual acima: a maior parte foi feita no navegador (ver notas). Faltam o logo enviado, a cor muito clara e o
      mural de homenagens em tempo real pelo link da sala.
- [x] A página pública do velório abre para visitante sem login.
- [x] Nenhuma chamada do frontend a rotas removidas na F2 (`/public/salas/:slug`), e `/velorios` só é chamada com login.
