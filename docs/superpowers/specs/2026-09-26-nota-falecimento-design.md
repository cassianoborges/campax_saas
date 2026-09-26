# Nota de falecimento (imagem para WhatsApp e redes)

## Contexto

O velório já guarda nome, foto, datas de nascimento/falecimento, sala e horário, sepultamento (data, local)
e responsável (`velorios`, spec `2026-07-17-perfil-falecido-sepultamento-design.md`), e a empresa tem logo e
cores (`empresas.logo_url`, `cor_primaria`, `cor_secundaria`). Hoje a funerária monta a nota de falecimento
fora do sistema, num editor de imagens, redigitando esses dados.

## Objetivo

Um botão **"Nota de falecimento"** em cada velório do painel abre um formulário, já preenchido com os dados do
velório, para completar o cadastro; ao salvar, gera uma **imagem PNG vertical 4:5 (1080×1350)** a partir de um
**modelo pronto** escolhido pelo usuário, com a **foto do falecido** e a **logo da funerária**, pronta para
compartilhar no WhatsApp e redes sociais.

Decisões tomadas com o usuário (2026-09-26):

| # | Decisão |
|---|---------|
| N1 | Saída: imagem para WhatsApp/redes (não PDF, não texto). |
| N2 | Formato único: vertical 4:5, 1080×1350. |
| N3 | Único campo novo: **familiares** (texto livre, "Deixa a esposa…"). |
| N4 | O que for preenchido no formulário é **salvo no velório** (gerar de novo já vem preenchido). |
| N5 | Divulgar a transmissão ao vivo é **opcional, marcado na hora** (não é salvo). |
| N6 | Geração **no navegador**, de HTML para PNG (`html-to-image`) — abordagem A. |
| N7 | **Modelos prontos no sistema** (Clássico, Sereno, Moderno); a funerária só escolhe. |
| N8 | Vitest entra no frontend para testar a montagem dos textos da nota. |

## Escopo

### 1. Banco de dados

- Nova coluna `velorios.familiares TEXT NULL`. Nullable, sem backfill → aplicada com `npx prisma db push`
  depois de editar `backend/prisma/schema.prisma` (`familiares String?`). Rodar `scripts/backup-db.sh` antes
  do push em produção. Recriar `campax_test` (`backend/scripts/refresh-dev-db.sh test`) para os testes verem
  a coluna.

### 2. Backend

- `VELORIO_FIELDS` (`backend/src/lib/http.ts`) ganha `familiares`.
- `POST /velorios` e `PATCH /velorios/:id` validam `familiares`: string ou `null`; string vazia/só espaços vira
  `null`; mais de **400** caracteres → 400 "Familiares: máximo de 400 caracteres".
- `GET /public/velorios/:token` **não** devolve `familiares` (a página pública não usa; o dado só sai na
  imagem que a família decidir compartilhar).
- Nenhuma rota nova: a foto continua pelo upload existente (`POST /velorios/:id/foto`), e salvar o formulário
  é o `PATCH /velorios/:id` de sempre.

### 3. Frontend

#### 3.1 Botão e diálogo

- Em `/admin/velorios` (`VelorioManagement.tsx`), cada velório ganha o botão **"Nota de falecimento"**,
  visível para quem pode editar velórios (`isOperador`, mesma regra do botão Editar).
- Abre `NotaFalecimentoDialog` (`src/components/nota-falecimento/`): formulário de um lado, pré-visualização ao
  vivo do outro; no celular, empilhados (pré-visualização em cima, reduzida).
- Topo do formulário: miniaturas dos modelos; a escolhida troca a pré-visualização na hora. O último modelo
  usado fica em `localStorage` (`campax_nota_modelo`; leitura/escrita em `try/catch`, padrão "classico").

#### 3.2 Campos do formulário (preenchidos a partir do velório)

| Campo | Origem | Obrigatório |
|-------|--------|-------------|
| Nome do falecido | `nome_falecido` | sim |
| Foto | `foto_falecido` (enviar/trocar pelo upload existente) | não |
| Data de nascimento | `data_nascimento` | não |
| Data de falecimento | `data_falecimento` | não |
| Velório: início e fim | `data_inicio`, `data_fim` (sala mostrada, não editável aqui) | sim |
| Sepultamento: data/hora e local | `data_sepultamento`, `local_sepultamento` | não |
| Familiares | `familiares` (novo), contador "n/400" | não |
| Incluir transmissão ao vivo | caixa de seleção, desmarcada por padrão, não salva | — |

Campo vazio não aparece na imagem.

#### 3.3 Dados da nota (função pura, testada)

`src/lib/notaFalecimento.ts`:

```ts
interface NotaFalecimentoDados {
  nome: string;
  fotoUrl: string | null;
  nascimento: string | null;     // "12/03/1941"
  falecimento: string | null;    // "25/09/2026"
  velorio: { sala: string; quando: string } | null;        // "Sala 1", "26/09 (sábado), das 8h às 16h"
  sepultamento: { quando: string | null; local: string | null } | null;
  familiares: string | null;
  transmissao: { endereco: string; codigo: string } | null; // "senap.campax.com.br", "ABC123"
  empresa: { nome: string; logoUrl: string | null; contato: string | null; corPrimaria: string; corSecundaria: string };
}
function montarNota(velorio, empresa, opcoes: { incluirTransmissao: boolean }): NotaFalecimentoDados
```

- Datas em hora local, `pt-BR`; dia do velório com dia da semana; horas no formato "8h", "8h30".
- Velório que termina em outro dia: "26/09, 8h, a 27/09, 10h".
- `transmissao.endereco`: `<slug>.<VITE_BASE_DOMAIN>` quando subdomínios estão ligados, senão o host atual
  (`location.host`); o código é `token_acesso`.
- Cores: `cor_primaria`/`cor_secundaria` da empresa; quando nulas, o dourado e o azul-marinho padrão da Campax
  (os valores de `--gold`/`--navy` em `src/index.css`, como constantes hex). A cor do texto sobre cada fundo
  vem de `foregroundFor` (`src/lib/branding.ts`), para manter o contraste.
- `contato`: `whatsapp_contato` formatado, senão `email_contato`, senão `null`.

#### 3.4 Modelos

Cada modelo é um componente `({ dados }: { dados: NotaFalecimentoDados }) => JSX` que desenha 1080×1350 px, e
fica registrado numa lista `MODELOS_NOTA` (`id`, `nome`, `componente`). Um modelo novo = um componente a mais
na lista. Estrutura comum, de cima para baixo: logo da funerária (sem logo → nome da funerária em texto, nunca
a logo da Campax), chamada ("Nota de Falecimento"), foto, nome (Playfair Display, fonte reduz para nomes
longos), datas (✱ nascimento ✝ falecimento), familiares, velório, sepultamento, transmissão (se marcada),
rodapé com o contato da funerária.

- **Clássico** — fundo na cor secundária (escuro), filetes e detalhes na cor primária, foto redonda com borda.
- **Sereno** — fundo claro, texto escuro, foto com moldura fina, ornamento discreto de ramos (SVG inline).
- **Moderno** — foto grande na metade de cima com degradê para a cor secundária, textos em bloco embaixo.

Sem foto: cada modelo tem uma variação sem a área da foto, com o nome em destaque.

#### 3.5 Geração da imagem

- Dependência nova: `html-to-image`.
- O modelo escolhido é renderizado fora da tela em 1080×1350 (a pré-visualização é o mesmo componente com
  `transform: scale`).
- Antes de exportar: `document.fonts.ready`; foto e logo são baixadas (`fetch`, CORS já liberado em `/files`)
  e convertidas em data URL — sem isso o canvas fica "tainted" e a exportação falha.
- `toPng(node, { width: 1080, height: 1350, pixelRatio: 1 })` → `Blob`; arquivo
  `nota-falecimento-<nome-em-slug>.png`.

#### 3.6 Salvar, gerar e compartilhar

1. "Salvar e gerar": `PATCH /velorios/:id` (e upload da foto, se trocada). Falhou → toast de erro do hook,
   diálogo continua aberto, nada é gerado.
2. Gera o PNG e mostra as ações:
   - **Compartilhar** — `navigator.canShare({ files })` verdadeiro (celular) → `navigator.share` com o arquivo
     (abre WhatsApp, Instagram…).
   - **Baixar PNG** — sempre disponível (principal no computador).
   - **Copiar imagem** — só onde `ClipboardItem` com `image/png` é suportado.

### 4. Erros e limites

- Foto ou logo não carregam → a nota sai sem elas (variação sem foto / nome da funerária em texto) e um toast
  avisa.
- Familiares > 400 → contador em vermelho e botão desabilitado (o backend também recusa).
- Falha no `toPng` → toast "Não foi possível gerar a imagem" e o botão volta a ficar ativo.

## Testes

- **Backend (Vitest, `backend/test/`)**: `PATCH /velorios/:id` grava e devolve `familiares`; vazio → `null`;
  401 caracteres → 400; `GET /public/velorios/:token` não contém `familiares`; usuário de outra empresa → 404
  (padrão de `test/isolamento`).
- **Frontend (Vitest, novo)**: `vitest` como devDependency da raiz, script `npm test`, ambiente `node`
  (as funções testadas não usam DOM), `@/` resolvido como no Vite. `test` de `montarNota`: datas e horários,
  velório em dois dias, campos vazios viram `null`, transmissão com e sem `VITE_BASE_DOMAIN`, fallback de cores
  e de contato.
- **Manual (navegador)**: os 3 modelos × (com/sem foto) × (com/sem logo); compartilhar no celular (Android e
  iPhone), baixar no computador; conferir que o PNG sai 1080×1350 e com as fontes certas.

## Fora de escopo

- Símbolo religioso, missa/culto de 7º dia.
- Editor de modelos e arte de fundo própria da funerária.
- Formatos quadrado e stories; PDF para impressão.
- Link público/URL da imagem gerada (a imagem não é guardada no servidor).
- Mostrar `familiares` na página pública do velório.

## Critérios de aceite

- O botão aparece para operador ou acima e abre o formulário já preenchido com os dados do velório.
- Trocar o modelo troca a pré-visualização na hora; o último modelo usado é lembrado.
- "Salvar e gerar" grava no velório (incluindo `familiares`) e gera um PNG 1080×1350 com a foto do falecido e a
  logo da funerária, nas cores da funerária.
- No celular, "Compartilhar" abre o menu do sistema com a imagem; no computador, "Baixar PNG" baixa o arquivo.
- Sem foto ou sem logo, a nota continua bonita e completa (sem espaços vazios, sem logo da Campax).
- Todos os testes do backend e do frontend passam.
