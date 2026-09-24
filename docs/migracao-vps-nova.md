# Migração para VPS nova — estado e contexto (2026-09-11)

Este documento existe para que uma sessão de Claude Code trabalhando **nesta VPS nova**
entenda o que já foi feito, o que falta, e por que algumas coisas estão
propositalmente paradas. Ele complementa (não substitui) `docs/linux-deployment.md`.

## Objetivo desta migração

O projeto Campax rodava inteiramente em um servidor compartilhado (`77.42.69.91`),
que também hospeda outros projetos não relacionados (autocastro, serpos, observador,
oauth-hub, hermes). Esta VPS nova (Hetzner, Ubuntu 24.04, IP `2.29.41.124`) é
**dedicada só ao Campax** e vai virar a produção definitiva depois que as
modificações planejadas forem feitas e testadas aqui.

Por enquanto (2026-09-11), é um ambiente de staging: o código já roda aqui, mas o
tráfego real (câmeras RTSP, DNS público) ainda está no servidor antigo.

## O que já está rodando nesta VPS

| Componente | Como roda | Status |
|---|---|---|
| Frontend (`campax-frontend-velorio`) | PM2, porta 8080, atrás de Nginx na porta 80 (sem domínio/SSL ainda) | ✅ rodando |
| `camera-status-api.cjs` | systemd `campax-cam-status.service`, porta 3011 | ✅ rodando |
| MediaMTX | Docker (`/root/mediamtx/docker-compose.yml`), portas padrão (8554/1935/8888/8889/9997/8189) | ✅ rodando, mas sem câmeras reais apontando pra cá ainda |
| `mediamtx-sync` | Buildado (`mediamtx-sync/dist/`), configurado no `ecosystem.config.cjs` | ⛔ **propositalmente parado** — ver seção abaixo |

Teste rápido: `curl http://2.29.41.124/` deve retornar o HTML do frontend.

## Por que o `mediamtx-sync` está parado

O Supabase é **compartilhado** entre o servidor antigo e esta VPS nova (mesmo
projeto, ver `.env`). O `mediamtx-sync` faz polling a cada 30s e **escreve de volta**
no Supabase (`cameras.mediamtx_path`, URL do WebRTC). Se ele rodar simultaneamente
nos dois servidores, as duas instâncias vão brigar pelo mesmo registro de câmera,
sobrescrevendo o path/URL uma da outra (flapping).

**Não inicie o `mediamtx-sync` aqui enquanto o servidor antigo ainda for a produção
real.** Ele só deve rodar em um dos dois lugares por vez. Isso faz parte do corte
de produção (ver checklist abaixo).

## Segredos e `.env`

Os arquivos `.env`, `.env.camera-status-api` e `mediamtx-sync/.env` foram copiados
manualmente via `scp` direto da máquina antiga para cá (não estão mais versionados
no git — ver próxima seção). Os valores do Supabase são os mesmos de produção.

O `MEDIAMTX_BASE_URL` em `mediamtx-sync/.env` foi ajustado para `http://localhost`
(já que aqui MediaMTX e o sync ficam na mesma máquina). O `MEDIAMTX_WEBRTC_BASE_URL`
ainda aponta para o domínio antigo (`media.campax.com.br`) — precisa ser atualizado
quando o DNS for cortado para cá (ver checklist).

## ⚠️ Achado de segurança (não resolvido no histórico do git)

O repositório GitHub (`cassianoborges/campax`) é **público**, e os arquivos de
`.env` com segredos reais (incluindo a `SUPABASE_SERVICE_KEY`, que ignora RLS)
estavam commitados no histórico. Em 2026-09-11:

- `.gitignore` foi atualizado para ignorar `.env`, `.env.*` (exceto `*.example`).
- Os arquivos foram removidos do **tracking atual** (`git rm --cached`), mas
  continuam no disco.
- **O histórico do git ainda contém as chaves antigas** — isso não foi limpo
  (exigiria reescrever histórico com `git filter-repo`/BFG, uma operação
  destrutiva que não foi autorizada ainda).
- **A `SUPABASE_SERVICE_KEY` exposta deveria ser rotacionada no painel do
  Supabase** (Project Settings → API) independentemente da limpeza do histórico,
  já que ficou pública. Confirmar com o usuário se isso já foi feito antes de
  assumir que a chave em uso ainda é segura.

## Diferenças de infraestrutura vs. servidor antigo

- Servidor antigo é **multi-tenant** (vários projetos não relacionados rodando
  junto via PM2/Docker). Esta VPS é **dedicada** só ao Campax.
- Aqui o reverse proxy é **Nginx puro** (`/etc/nginx/sites-available/campax`),
  não o nginx-proxy-manager (Docker + MariaDB) usado no servidor antigo — decisão
  deliberada por simplicidade, já que não há outros projetos para isolar.
- Não há SSL configurado ainda aqui (sem domínio apontando pra cá).
- Acesso SSH: chave de automação gerada em `~/.ssh/campax_new_vps` na máquina
  onde este Claude Code roda (não fica na VPS). A senha root original foi enviada
  em texto puro no chat pelo usuário — **recomendado trocá-la ou desabilitar
  login por senha** (`PasswordAuthentication no` em `/etc/ssh/sshd_config`) já
  que a autenticação por chave já funciona.

## Checklist para virar produção de fato

- [ ] Rotacionar a `SUPABASE_SERVICE_KEY` exposta (ver seção de segurança acima)
- [ ] Decidir e limpar o histórico do git (ou aceitar o risco residual)
- [ ] Apontar DNS de `media.campax.com.br`, `check.campax.com.br` e do domínio do
      frontend para `2.29.41.124`
- [ ] Configurar SSL (certbot) no Nginx desta VPS
- [ ] Atualizar `mediamtx-sync/.env` (`MEDIAMTX_WEBRTC_BASE_URL`) e o `.env` do
      frontend (`VITE_CAMERA_STATUS_API_URL`) para os domínios/IPs definitivos,
      rebuildar o frontend
- [ ] Reconfigurar as câmeras físicas para enviar RTSP para o IP novo
- [ ] **Parar o `mediamtx-sync` no servidor antigo antes de iniciar o daqui**
      (ou vice-versa — nunca os dois ao mesmo tempo)
- [ ] Iniciar `mediamtx-sync` aqui via PM2 (`pm2 start ecosystem.config.cjs --only campax-sync-velorio`)
- [ ] Decomissionar o `mediamtx-sync`/frontend/camera-status-api no servidor
      antigo depois de validar tudo aqui
