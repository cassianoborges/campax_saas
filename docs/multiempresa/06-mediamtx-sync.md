# Spec 06 — F5: MediaMTX e mediamtx-sync

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [02-schema-e-migracao.md](02-schema-e-migracao.md)
> Status: **implementada em 2026-09-23** (partes A e B), no ar no ambiente de desenvolvimento.

## Objetivo

Fazer com que as câmeras de várias funerárias convivam no mesmo MediaMTX **sem colisão de nomes**, que uma
empresa suspensa saia do ar e que **ninguém consiga assistir à câmera de uma funerária sem ter recebido o link
de um velório**.

## Contexto (verificado em produção em 2026-09-23)

- `mediamtx-sync/src/sync.ts` gera o nome do caminho a partir de `camera.nome` (`santana`, `uruacu`, `uruacu2`,
  `niquelandia`, `sala_anapolis`). Duas funerárias com uma câmera "Sala 1" colidiriam.
- **Leitura anônima liberada:** `/root/mediamtx/mediamtx.yml` tem o usuário `any` com `action: read` em todos os
  caminhos (`all_others`). Qualquer pessoa que adivinhe o nome assiste à câmera, **a qualquer hora, sem
  token e fora do horário do velório**. Testado: `https://media2.campax.com.br/santana/` responde 200. Com nomes de
  cidade, adivinhar é trivial, e com várias funerárias o problema se multiplica.
- **Portas abertas para a internet** (`0.0.0.0`, sem firewall — `ufw inactive`): 8554 (RTSP), 8888 (HLS), 8889
  (WebRTC) e 9997 (API, com Basic auth). O frontend só usa WebRTC via `media2.campax.com.br` (→ 8889). As câmeras são
  **puxadas** pelo MediaMTX (`source`), e não publicam nele. Ou seja, 8554 e 8888 não têm uso externo e ampliam a
  exposição (dá para ler `rtsp://2.29.41.124:8554/santana`).
- **Bug latente:** `addCamera` trata "already exists" como sucesso **sem atualizar o `source`**. Se o operador mudar o
  `rtsp_url` de uma câmera no admin, o MediaMTX continua puxando o endereço antigo até alguém apagar o caminho à mão.
  Hoje os 5 `source` batem com o banco (conferido por hash) só porque os caminhos foram criados recentemente.
- A remoção de órfãos apaga **qualquer** caminho que não seja de câmera ativa. Isso funciona hoje, mas apagaria também
  caminhos configurados à mão.
- O backend **não** chama o webhook `/webhook/camera-change`: mudanças levam até 30 s para chegar ao MediaMTX.
- `mediamtx-sync/.env` tem quebras de linha CRLF (quebra o `source` no shell; o `dotenv` tolera).
- O player público (`VelorioViewing.tsx`) usa um `<iframe src={camera.webrtc_url}>` (página de leitura do próprio
  MediaMTX).

## Parte A — MVP (obrigatória)

### A1. Nome do caminho: `<empresa.slug>-<aleatório>`

- Formato: `<slug da empresa>-<10 caracteres [a-z0-9]>`, ex. `funeraria-x-k3v9q2m7ta`. Gerado **uma vez**
  (`crypto.randomInt`) e gravado em `cameras.mediamtx_path`; nunca é derivado do nome da câmera (renomear a câmera não
  muda o endereço).
- Evita a colisão entre empresas (prefixo + `UNIQUE` da F1) e torna o endereço **impossível de adivinhar**
  (36¹⁰ ≈ 3,6 × 10¹⁵). Isso não substitui o controle de acesso da parte B, mas elimina o "adivinhar pelo nome da cidade".
- Se o `UPDATE` bater no `UNIQUE`, gera outro nome e tenta de novo (até 3 vezes).

### A2. Troca dos 5 caminhos atuais

Os nomes atuais são adivinháveis, então **todos** são trocados, e não só as câmeras novas. *(Isso substitui a decisão
derivada do planejamento "os caminhos atuais do MediaMTX não mudam".)*

- Como `webrtc_url` vem do banco em cada carregamento da página pública, a troca vale **sozinha** no próximo
  carregamento. Nada a mudar no frontend.
- Script `npm run rotate-paths` (no mediamtx-sync): para cada câmera ativa, gera o nome novo, cria o caminho novo,
  atualiza `mediamtx_path` e `webrtc_url` e **depois** apaga o caminho antigo.
- Executar numa janela sem velório ao vivo (quem estiver assistindo perde a imagem até recarregar a página). Entra no
  checklist de deploy.

### A3. Consulta com empresa

```sql
SELECT c.*, e.slug AS empresa_slug
FROM cameras c JOIN empresas e ON e.id = c.empresa_id
WHERE c.ativo AND e.ativo
```

Câmeras de empresa suspensa ficam fora, e os caminhos delas são removidos como órfãos. Reativar a empresa
recria os caminhos **com o mesmo nome** (está gravado), então os links continuam válidos.

### A4. Sincronização como função pura + correção do `source`

Reescrever o núcleo como `planSync(camerasDoBanco, caminhosDoMediaMTX) → { adicionar, atualizarSource, remover }`,
sem efeito colateral, e o executor aplica o plano:

- **adicionar**: câmera sem caminho no MediaMTX → `POST /v3/config/paths/add/<nome>`.
- **atualizarSource**: caminho existe com `source` diferente do `rtsp_url` → `PATCH /v3/config/paths/patch/<nome>`
  (**corrige o bug latente**). A lista vem de `GET /v3/config/paths/list`, que traz o `source`, e não de
  `/v3/paths/list`.
- **remover**: caminho **gerenciado** sem câmera ativa. Gerenciado = casa com `^[a-z0-9-]+-[a-z0-9]{10}$`. Caminhos com
  outro formato (`all_others` e qualquer configuração manual) **nunca** são apagados pelo sync. Os nomes antigos
  saem pelo `rotate-paths` (A2), não pela remoção de órfãos.
- Se a consulta ao banco ou a listagem do MediaMTX **falhar**, o ciclo é abortado, sem remover nada. Hoje
  `listPaths` devolve `[]` em caso de erro.
- `updateCameraUrls` só roda quando o valor mudou (hoje grava as 5 câmeras a cada 30 s).
- Logs: uma linha de resumo por ciclo quando nada mudou (hoje são ~12 linhas a cada 30 s nos logs do PM2).

### A5. Sincronização imediata

- O mediamtx-sync passa a escutar só em `127.0.0.1` (os endpoints não têm autenticação).
- O backend chama `POST http://127.0.0.1:<porta>/webhook/camera-change` (variável `MEDIAMTX_SYNC_URL` no
  `backend/.env`) depois de criar, editar ou excluir câmera e de suspender ou reativar empresa (F3). A chamada não
  bloqueia a resposta (timeout de 2 s); se falhar, só gera log, porque o ciclo de 30 s cobre.

### A6. Portas

- Publicar 8554 (RTSP) e 8888 (HLS) do container **só em `127.0.0.1`**. Nenhum dos dois tem uso externo (ver Contexto).
- 8889 (WebRTC) continua pública (o `media2.campax.com.br` faz proxy para ela), e 8189/UDP continua aberta (mídia WebRTC).
- 9997 (API): continua como está nesta fase, porque o `apicam.campax.com.br` faz proxy para o IP público. Revisar
  junto com a parte B.
- **Antes de mudar,** levantar como o container foi criado (`docker inspect mediamtx`, compose ou `docker run`) e
  documentar no `docs/linux-deployment.md`.

### A7. Higiene

- `mediamtx-sync/.env` para LF.
- Porta padrão no `index.ts`: `3001` → `3002`, igual à documentação (3001 é a camera-status-api de dev).

### Testes (parte A)

`mediamtx-sync` ganha Vitest (só testes unitários, sem banco nem MediaMTX):
- `generatePathName`: formato, prefixo, aleatoriedade.
- `planSync`: câmera nova → adicionar; `rtsp_url` alterado → atualizarSource; câmera desativada ou empresa suspensa →
  remover; `all_others` e nomes fora do padrão nunca são removidos; lista vazia de câmeras com caminhos gerenciados →
  remove todos (comportamento correto, e explícito no teste).

Verificação manual no `campax_dev` + MediaMTX real: editar o `rtsp_url` de uma câmera no admin → o `source` é atualizado
em ≤ 2 s; suspender a empresa de teste → os caminhos dela somem; reativar → voltam com o mesmo nome.

## Parte B — Controle de acesso às transmissões (decisão M1)

Mesmo com nomes aleatórios, quem recebeu o `webrtc_url` uma vez (ele vem na resposta pública do velório) consegue
assistir àquela câmera **para sempre**, inclusive em velórios de outras famílias na mesma sala, dias depois. O link
pode ter sido encaminhado no WhatsApp ou ter ficado no histórico do navegador.

**Proposta:** autenticação HTTP do MediaMTX apontando para o backend.

- `mediamtx.yml`: `authMethod: http`, `authHTTPAddress: http://<backend>/internal/mediamtx/auth`.
- `POST /internal/mediamtx/auth` (aceita só chamadas do host local ou da rede do Docker) recebe
  `{ user, password, ip, action, path, protocol, query }` e responde 200 ou 401:
  - `action = read`: exige `?t=<token>` na query. O token é um JWT curto (ex. 4 h) assinado pelo backend, com
    `{ velorio_id, paths[] }`. É válido só se o `path` está no token **e** o velório está no ar **agora** (com margem
    configurável, ex. 30 min antes e depois) **e** a empresa está ativa.
  - `action = api`: valida o usuário e a senha do MediaMTX (os mesmos do `.env`, que o mediamtx-sync e o `apicam`
    usam).
  - `publish` e o resto: 401.
- As respostas públicas do velório passam a trazer `stream_url = webrtc_url + '?t=' + token`, gerado a cada requisição.
  O preview do admin (`CameraManagement`) pede um token por uma rota autenticada.
- Leitores já conectados não são derrubados quando o token expira. A checagem acontece na conexão (comportamento do
  MediaMTX), o que é aceitável.

**Pontos a confirmar num spike de 1 dia antes de fechar a parte B:**
1. Se a página de leitura do MediaMTX (usada no iframe) repassa a query string (`?t=`) para a requisição WHEP. Se não
   repassar, o frontend troca o iframe pelo `WebRTCPlayer.tsx` que já existe no repositório (faz WHEP direto).
2. Semântica exata de `authHTTPExclude` na versão instalada. Não pode abrir a API sem senha por engano.
3. O MediaMTX consegue alcançar o backend (o container precisa de rota até a porta 3013 do host).
4. Latência: uma chamada ao backend por conexão de leitor (esperado, desprezível).

| Opção | O que resolve | Esforço |
|-------|---------------|---------|
| **Só parte A** | Colisão, endereço impossível de adivinhar, empresa suspensa sai do ar. O link vazado continua funcionando para sempre. | ~2–3 dias |
| **A + B no MVP** (recomendado) | Tudo acima + o link só funciona para quem abriu o velório e só enquanto ele está no ar. | +3–4 dias (inclui o spike) |
| A agora, B logo após o piloto | Igual à primeira até a B entrar. | igual |

## Notas da implementação (2026-09-23)

**Parte A**
- `mediamtx-sync/src/`: `paths.ts` (nome + `MANAGED_PATH`), `plan.ts` (`planSync` puro), `sync.ts` (executor; ciclos
  simultâneos do timer e do webhook compartilham a mesma execução), `db.ts` (JOIN com `empresas`),
  `scripts/rotatePaths.ts`; 10 testes Vitest em `mediamtx-sync/test/`.
- **Troca executada:** os 5 caminhos (`santana`, `uruacu`, `uruacu2`, `niquelandia`, `sala_anapolis`) viraram
  `campax-<10>`. Os nomes antigos dão 404 na API e no RTSP. 4 câmeras entregam vídeo pelo caminho novo; a
  `SALA ANAPOLIS` já estava fora do ar (`no route to host` para o IP da câmera, sem relação com a troca).
- **Correção do `source` verificada:** um PATCH de `rtsp_url` pelo admin chega ao MediaMTX em menos de 2 s (webhook).
- **O sync escuta em `127.0.0.1:3002`** (o `.env` dizia 3001, que conflita com a camera-status-api de dev; corrigido,
  e o arquivo passou para LF).
- **Portas:** 8554, 8888 **e 1935 (RTMP, também sem uso)** publicadas só em `127.0.0.1` no
  `/root/mediamtx/docker-compose.yml` (backup em `docker-compose.yml.bak-20260923`). Recriar o container apaga os
  caminhos criados pela API; o sync os recoloca no próximo ciclo ou pelo webhook.

**Parte B**
- **Resultado do spike:** (1) a página de leitura do MediaMTX v1.21 repassa `window.location.search` para o WHEP,
  então o iframe atual serve; (2) uma ação em `authHTTPExclude` **fica sem autenticação**, por isso a lista é vazia e o
  backend também autoriza a ação `api` (credenciais em `MEDIAMTX_API_USER`/`MEDIAMTX_API_PASSWORD`); (3) o container
  alcança o backend em `172.18.0.1:3013` (gateway da rede `mediamtx_default`).
- **`POST /internal/mediamtx/auth/:key`** (`backend/src/routes/internal.ts`): a chave vem de `MEDIAMTX_AUTH_KEY`, e
  requisições com `X-Forwarded-For` (que passaram pelo proxy público) respondem 404. Testado: com a chave certa, a
  mesma chamada pelo `backend.campax.com.br` dá 404.
- **Token** (`backend/src/lib/streamToken.ts`): JWT com chave derivada do `JWT_SECRET` e audience própria (não serve
  como token de login, e vice-versa), `{ v: velorio_id | null, p: [paths] }`. Na página pública, o token **vale até o
  fim do velório + margem** (e não as 4 h fixas planejadas), porque velórios podem atravessar a noite e uma reconexão
  tardia seria negada. No preview do admin (`POST /cameras/:id/stream-url`), vale 1 h e não tem janela de horário.
- **Fora da janela do velório, a API pública não manda `stream_url`.** Motivo: o MediaMTX responde 401 com um
  desafio Basic, e o navegador mostraria um pedido de login dentro da página. A página mostra "A transmissão fica
  disponível durante o velório".
- **Verificado:** sem token, a página e o WHEP dão 401, e o RTSP também; com token, o RTSP entrega vídeo e o WebRTC toca
  no Google Chrome (1920x1080), inclusive dentro da página pública `/velorio/:id`; o token de uma sala dá 401 na câmera
  de outra sala; o `apicam.campax.com.br` responde 200 com senha e 401 sem senha; o sync continua funcionando pela
  autenticação. 11 testes novos no backend (109 no total).
- **Achado importante, fora do escopo:** 3 das 4 câmeras que respondem enviam **H.265**. WebRTC com H.265 só toca em
  navegadores com decodificação por hardware (Safari; Chrome/Edge em parte dos aparelhos). Em muitos computadores o
  player mostra "codecs not supported by client". Isso **já acontecia antes** e não tem relação com esta fase. Opções:
  configurar as câmeras para H.264 (sem custo, recomendado) ou transcodificar no servidor (CPU). Registrado como risco no
  planejamento.
- **Rollback da parte B:** `cp /root/mediamtx/mediamtx.yml.bak-20260923 /root/mediamtx/mediamtx.yml && docker compose
  -f /root/mediamtx/docker-compose.yml restart`. O frontend continua funcionando, porque o `stream_url` com `?t=` é
  ignorado pela autenticação interna.

## Fora de escopo

- Um MediaMTX por empresa ou servidores de mídia distribuídos.
- Gravação das transmissões.
- Firewall geral da VPS (o `ufw` está inativo; vale uma revisão própria de infraestrutura, fora do multiempresa).

## Critérios de aceite (parte A)

- [x] Todos os `cameras.mediamtx_path` no formato `<slug>-<10>`; os nomes antigos (`santana` etc.) não existem mais no
      MediaMTX, e `https://media2.campax.com.br/santana/` não abre a câmera.
- [x] Transmissão de um velório ao vivo funciona pela página pública depois da troca (Chrome, câmera H.264).
- [x] Editar o `rtsp_url` no admin é aplicado ao MediaMTX em segundos.
- [ ] Empresa suspensa: os caminhos somem; reativada: voltam com o mesmo nome. Coberto por teste unitário
      (`planSync`) e pela consulta com `e.ativo`, mas não exercitado no MediaMTX real, porque a única empresa com câmeras
      é a de produção.
- [x] `all_others` continua existindo depois de vários ciclos.
- [x] 8554 e 8888 (e 1935) não respondem pelo IP público; a transmissão pelo `media2` continua funcionando.
- [x] Testes unitários do mediamtx-sync passam.
