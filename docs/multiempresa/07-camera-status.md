# Spec 07 — F6: Checagem de câmera dentro do backend

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [03-backend-isolamento.md](03-backend-isolamento.md)
> Status: **implementada em 2026-09-23**. O servidor antigo (`check.campax.com.br`) ainda precisa ser desligado, com autorização.

## Objetivo

Substituir a `camera-status-api` (um serviço à parte, sem autenticação) por uma checagem feita **pelo backend**,
**só nas câmeras da empresa de quem pede**, usando o endereço gravado no banco. Isso fecha o varredor de portas
público e para de enviar credenciais das câmeras pela rede.

## Contexto (verificado em produção em 2026-09-23)

- O frontend (`src/services/cameraStatusService.ts`) chama `VITE_CAMERA_STATUS_API_URL`, que em produção é
  **`https://check.campax.com.br`**, e esse domínio resolve para **77.42.69.91, o servidor antigo**. Ou seja, o frontend
  novo manda para o servidor antigo o `rtsp_url` completo de cada câmera (**com usuário e senha**). Quando o servidor
  antigo for desligado, a checagem de status para de funcionar.
- `camera-status-api.cjs`: `cors()` aberto para qualquer origem, sem autenticação, aceita **qualquer** `rtsp_url` e
  testa conexão TCP com o host e a porta indicados. É um **varredor de portas público**: `POST /api/camera/check-status`
  com `rtsp://127.0.0.1:22/x` respondeu `{"online":true}` (testado). `check-multiple` não tem limite de quantidade.
- Nesta VPS, o `campax-cam-status.service` (porta 3011) está ativo, mas **nenhum cliente o usa** (o frontend aponta para
  o `check.campax.com.br`).
- Fluxo atual: o navegador testa as câmeras → recebe `Map<id, online>` → manda para `POST /cameras/bulk-status`, que grava
  o que o **cliente** disser (o status é confiado ao navegador).
- Quem chama: `CameraManagement.tsx` (testa todas as câmeras ao abrir a página) e `VelorioManagement.tsx` (testa as
  câmeras da sala escolhida no formulário de velório).
- As 5 câmeras atuais têm **host público** (4 IPs, 1 hostname que resolve para IP público; conferido sem expor os
  endereços). Nenhuma usa rede privada.

## Desenho

### 1. Rotas no backend

| Rota | Papel mínimo | Comportamento |
|------|--------------|---------------|
| `POST /cameras/check-status` | `viewer` | Corpo `{ ids?: string[] }`. Sem `ids`: todas as câmeras **ativas** da empresa. Com `ids`: só as que forem da empresa (as outras são ignoradas, via `req.db`). Testa, **grava** `cameras.status` (`online`/`offline`) e `status_checked_at`, e responde `{ data: { [id]: { online, checked_at } } }`. |

- `POST /cameras/bulk-status` é **removida**: o status não é mais informado pelo cliente.
- O `rtsp_url` nunca sai do servidor para essa finalidade.

### 2. Checagem (`backend/src/lib/cameraCheck.ts`)

- `parseRtspHost(url)`: mesma lógica do `parseRtspUrl` atual (inclusive o `lastIndexOf('@')`, para senhas com `@`),
  porta padrão 554.
- **Resolve o DNS uma vez** e conecta no **IP resolvido**, não no nome. Isso evita que um nome aponte para um endereço
  permitido na validação e para um interno na conexão (DNS rebinding).
- **Endereços bloqueados** (o teste nem é feito; o resultado é `online: false, error: 'Endereço não permitido'`):
  loopback, redes privadas (10/8, 172.16/12, 192.168/16), link-local (169.254/16, inclui metadados de nuvem), CGNAT
  (100.64/10), `0.0.0.0/8`, multicast, reservados e os equivalentes IPv6 (`::1`, `fc00::/7`, `fe80::/10`). Usar
  `ipaddress`-like via `net.BlockList` do Node.
- Timeout de 3 s por câmera, **no máximo 10 conexões simultâneas** por requisição.
- **Cache por câmera de 30 s** (em memória): abrir a página de câmeras várias vezes seguidas não gera novas conexões.
  Isso também limita o uso da rota para martelar um host.

### 3. Validação ao salvar a câmera (reforço)

- `POST/PATCH /cameras` (F2) passam a validar o `rtsp_url`: esquema `rtsp://` ou `rtsps://`, host resolvível e **fora
  da lista bloqueada**. Caso contrário, respondem 400 `Endereço da câmera não permitido`.
- Motivo: o **MediaMTX também conecta** no `rtsp_url` (é o `source` do caminho). Sem essa validação, um operador de
  qualquer empresa poderia apontar uma "câmera" para um serviço interno da VPS (Postgres, API do MediaMTX) através do
  próprio MediaMTX.
- O mediamtx-sync (F5) aplica a mesma checagem de forma defensiva: câmera com host bloqueado não é enviada ao MediaMTX,
  e o motivo vai para o log.
- Se um dia uma funerária precisar de câmera em rede privada (via VPN), isso vira uma exceção por empresa, decidida
  naquele momento. Hoje nenhuma câmera precisa.

### 4. Schema

`cameras.status_checked_at timestamptz NULL`. Pode entrar no script da F1 (`001_multiempresa.sql`) ou num
`002_camera_status.sql` separado, desde que o `schema.prisma` acompanhe.

### 5. Frontend

- `cameraStatusService.ts`: `checkMultipleCameras(ids)` → `apiClient.post('/cameras/check-status', { ids })`. A função
  `checkCameraStatus(rtsp_url)`, de câmera avulsa, é removida (hoje não tem uso nas páginas).
- `CameraManagement.tsx`: chama `checkMultipleCameras()` sem ids e invalida `['cameras']`. Remove a chamada a
  `bulkUpdateStatus`.
- `VelorioManagement.tsx`: `checkMultipleCameras(salaCameras.map(sc => sc.camera_id))`. **Deixa de ler
  `sc.cameras.rtsp_url`**.
- `useCameras.ts`: remove `bulkUpdateStatus`.
- Mostrar "verificado há X min" com `status_checked_at` na lista de câmeras (opcional, barato).
- Remover `VITE_CAMERA_STATUS_API_URL` do `.env` e do `.env.example`.

### 6. Desativação da camera-status-api

Depois do deploy desta fase e de 1 semana sem erro:
- Nesta VPS: `systemctl disable --now campax-cam-status`, apagar a unit, remover `camera-status-api.cjs`,
  `.env.camera-status-api*` e `docs/camera-status-deployment.md`.
- Servidor antigo e `check.campax.com.br`: desligar o serviço e remover o proxy host no nginx-proxy-manager **de lá**.
  Isso toca o servidor antigo, então precisa de ação ou autorização explícita do responsável.
- CLAUDE.md: remover a seção da camera-status-api e as linhas da tabela de portas.

## Paliativo recomendado (antes do multiempresa, na `main`)

O varredor de portas público (`check.campax.com.br`) e o envio de credenciais ao servidor antigo existem **hoje**.
Esta spec resolve os dois, mas depende da F2. Enquanto isso não sobe, uma correção pequena e isolada na `main` resolve
o essencial:
- Rota `POST /cameras/check-status` já no backend atual (autenticada; sem filtro por empresa, que ainda não existe),
  com a lista de endereços bloqueados e o limite de concorrência.
- O frontend passa a usá-la; `check.campax.com.br` deixa de ser chamado.

Depois, a F6 só acrescenta o filtro por empresa (`req.db`) e a validação ao salvar.

## Testes (Vitest, backend)

- `parseRtspHost`: com e sem porta, credenciais com `@` e `:` na senha, hostname, IPv6 entre colchetes, URL inválida.
- Lista bloqueada: `127.0.0.1`, `10.0.0.5`, `192.168.1.10`, `169.254.169.254`, `::1`, e hostname que resolve para
  loopback (`localhost`) → bloqueados, sem nenhuma conexão aberta (espionar `net.connect`).
- Isolamento: usuário da empresa A com `ids` de câmeras de B → as de B não aparecem na resposta e o `status` delas não
  muda.
- Cache: duas chamadas seguidas → uma conexão por câmera.
- `POST /cameras` com `rtsp://127.0.0.1:5432/x` → 400.
- `POST /cameras/bulk-status` → 404 (rota removida).
- A checagem de TCP em si usa um servidor `net.createServer` temporário numa porta local. Para isso, os testes injetam
  uma lista de bloqueio vazia, e só nesse teste.

## Notas da implementação (2026-09-23)

- **Arquivos:** `backend/src/lib/cameraCheck.ts`, `POST /cameras/check-status` em `routes/cameras.ts` (e a validação
  no POST/PATCH), `backend/prisma/sql/002_camera_status_checked_at.sql` (aplicado nos 3 bancos; `migrate diff` vazio),
  `mediamtx-sync/src/hostGuard.ts`, frontend `services/cameraStatusService.ts`, `CameraManagement.tsx` (mostra
  "verificado às HH:MM") e `VelorioManagement.tsx`.
- **Lista de bloqueio** com `net.BlockList`. Diferença em relação à spec: `::ffff:0:0/96` **não** entra na lista, porque
  bloquearia todo IPv4 público na forma mapeada. Em vez disso, um endereço mapeado é convertido e checado como IPv4
  (`::ffff:127.0.0.1` é bloqueado, e há teste para isso).
- **Os testes trocam a lista de bloqueio** por `checkDefaults.blockList` (só os testes que precisam de um servidor em
  localhost). As câmeras criadas pelos testes antigos passaram a usar IPs de documentação (`203.0.113.x`), porque
  `*.example.com` não resolve e agora a validação exige host resolvível.
- **Verificado no navegador** (`app2`): a tela de Câmeras só faz requisições ao `backend.campax.com.br`, nenhuma ao
  `check.campax.com.br` nem à porta 3011; status Online/Offline correto (a `SALA ANAPOLIS` aparece offline e está de
  fato fora do ar) com o horário da checagem; no formulário de velório, escolher a sala manda só o id da câmera, e a
  bolinha fica verde.
- **camera-status-api desta VPS desligada** (`systemctl disable --now campax-cam-status`). Ela estava **aberta na
  internet** (porta 3011, sem firewall) e respondia `online` para `127.0.0.1:5432`, o Postgres interno. Foram removidos
  `camera-status-api.cjs`, `.env.camera-status-api.example` e `docs/camera-status-deployment.md`. A unit systemd
  e o arquivo local `.env.camera-status-api` (fora do git, com chaves do Supabase) foram apagados em 2026-09-26.
- **Pendente (precisa de autorização):** desligar o serviço em **77.42.69.91** e remover o proxy `check.campax.com.br`.
  Ele continua sendo um varredor de portas público, embora o sistema não o use mais.
- 23 testes novos no backend (132 no total) e 6 no mediamtx-sync (16 no total).

## Fora de escopo

- Checagem de RTSP de verdade (`DESCRIBE`) em vez de só conectar por TCP.
- Checagem periódica em segundo plano e alertas de câmera offline (candidato natural para depois do MVP, já que a
  checagem passa a estar no servidor).

## Critérios de aceite

- [x] Nenhuma requisição do frontend vai para `check.campax.com.br` ou `:3011` (conferido pela rede do navegador e por
      `grep` por `VITE_CAMERA_STATUS_API_URL`).
- [x] Nenhuma resposta ou requisição de checagem carrega `rtsp_url`.
- [x] Status online/offline aparece em Câmeras e no formulário de Velório como hoje.
- [x] Câmera com endereço interno não pode ser salva, e o MediaMTX não recebe esse endereço.
- [x] Testes passam.
- [ ] Desativação: feita nesta VPS; no servidor antigo (`check.campax.com.br`) aguarda autorização.
