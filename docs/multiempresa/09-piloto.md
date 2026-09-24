# Spec 09 — F8: Deploy do MVP e piloto com a 2ª funerária

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: specs 01 a 07 (F0–F6)
> Status: **pronta** (é um roteiro de operação, não de código)

## Objetivo

Colocar o MVP multiempresa em produção **sem interromper a funerária atual** e operar uma segunda funerária
real por um período de avaliação. No fim, decidir com base em dados se o produto está pronto para mais clientes.

## Pré-requisitos (bloqueiam o piloto)

| # | Item | Dono |
|---|------|------|
| P1 | F0 concluída: `campax_dev`/`campax_test`, backup diário **com restauração testada**, fotos fora do Supabase Storage, virada do Supabase concluída | dev |
| P2 | F1–F6 implementadas na `feat/multiempresa`, todos os testes passando (`backend`, `mediamtx-sync`), checklists manuais das specs 05 e 06 feitos no `campax_dev` | dev |
| P3 | **Termos de uso revisados (Q5).** O texto atual (`src/content/termos-de-uso-v1.0.md`) fala só em "Campax" e afirma que a Campax "não compartilha … dados pessoais … a terceiros", mas os dados dos visitantes (nome, celular) aparecem nos relatórios da funerária. Com várias funerárias, o termo precisa dizer quem é o **controlador** (a funerária) e quem é o **operador** (a Campax). Resultado: um termo `v2.0`, aceite novo exigido (o mecanismo de versão já existe) | jurídico + Campax |
| P4 | **Contrato com a funerária piloto**, incluindo o acordo de tratamento de dados (LGPD, art. 39): o que a Campax faz com os dados, retenção, incidentes | Campax |
| P5 | Levantamento do n8n (spec 01 §5) resolvido | Campax |
| P6 | Capacidade medida (ver "Capacidade") | dev |

## Etapa 1 — Deploy em produção (funerária atual)

Três janelas separadas, **todas sem velório ao vivo** (`SELECT count(*) FROM velorios WHERE now() BETWEEN data_inicio AND data_fim` = 0, e nenhum começando nas 2 h seguintes).

### Janela 1 — F1 + F2 + F4 (+ F6), juntas

A F6 vai junto porque a F2 remove `POST /cameras/bulk-status` e o frontend da F4 já usa a checagem nova.

1. Aviso interno: horário e duração estimada (≈ 30 min).
2. `scripts/backup-db.sh` → anotar o arquivo.
3. `git checkout main && git merge --no-ff feat/multiempresa` (depois da revisão da PR).
4. `pm2 stop campax-backend-velorio campax-sync-velorio`.
5. `psql ... -f backend/prisma/sql/001_multiempresa.sql` com os parâmetros da empresa atual (`hash_publico` = valor de `VITE_EMPRESA_HASH`).
6. `cd backend && npm ci && npm run build`; `cd mediamtx-sync && npm ci && npm run build`; na raiz, `npm ci && npm run build`
   (depois de remover `VITE_EMPRESA_HASH` e `VITE_CAMERA_STATUS_API_URL` do `.env`).
7. `npm run create-platform-admin -- --email <e-mail da equipe Campax>`.
8. `pm2 restart all`.
9. **Testes de fumaça** (≤ 10 min), anotando o resultado:
   - [ ] Login dos 4 usuários atuais; painel mostra os velórios, as salas e as câmeras de sempre.
     *2026-09-24:* painel ok para os 4 perfis (JWT gerado no servidor: 37 velórios, 5 salas, 5 câmeras, empresa
     "Campax"); `POST /auth/login` com senha errada → 401. **Falta** o login com a senha real de cada um.
   - [x] Um link público de sala **antigo** (impresso ou em QR code) abre. *2026-09-24:* as 5 salas em
     `/d2788b07/<slug>` (API e frontend); hash inexistente → 404.
   - [x] Token de um velório → página do velório **sem login** → vídeo. *2026-09-24:* velórios de teste (apagados)
     nas 4 salas com câmera online: `stream_url` presente, sem `rtsp://` na resposta; HLS com `?t=` → 200, sem → 401.
     Codecs: `uruacu2` H.264; `Sala Uruaçu 1`, `santana`, `niquelandia` **H.265** (não tocam em WebRTC na maioria
     dos navegadores — trocar para H.264 na câmera).
   - [x] Status de câmeras aparece em Câmeras. *2026-09-24:* `check-status` → 4 online, SALA ANAPOLIS offline.
   - [ ] `platform_admin` entra em `/platform` e vê 1 empresa. *2026-09-24:* **bloqueado** — ainda não existe
     `platform_admin` (passo 7 não feito); superadmin em `/platform/empresas` → 403, como esperado.
10. **Rollback** se qualquer item falhar e não for corrigível em 15 min: `pm2 stop all` → `pg_restore --clean` do backup
    do passo 2 → `git checkout <commit anterior>` → rebuild → `pm2 restart all`.

### Janela 2 — F5 parte A (caminhos e portas)

1. `npm run rotate-paths` no mediamtx-sync → conferir que os 5 caminhos novos estão no MediaMTX e os antigos sumiram.
2. Recriar o container do MediaMTX com 8554 e 8888 só em `127.0.0.1` (comando documentado na spec 06, A6).
3. Fumaça: vídeo pela página pública; `https://media2.campax.com.br/santana/` **não** abre;
   `nc -zv 2.29.41.124 8554` de fora falha.

### Janela 3 — F5 parte B (autenticação das transmissões)

1. Atualizar `mediamtx.yml` (`authMethod: http`) + reiniciar o MediaMTX.
2. Fumaça: vídeo pela página pública (com `?t=`); o mesmo endereço **sem** `?t=` → negado; com um token de velório
   encerrado → negado; `apicam.campax.com.br` e o mediamtx-sync continuam funcionando (ação `api`).
3. Rollback: voltar o `mediamtx.yml` anterior (guardar uma cópia antes) e reiniciar o container.

**Depois da janela 3: 1 semana de observação só com a funerária atual** antes de cadastrar a segunda.
Em seguida, desativar a camera-status-api (spec 07 §6).

## Etapa 2 — Cadastro da funerária piloto

Feito pelo `platform_admin` em `/platform`, **sem acesso ao banco**. Esse é, por si só, um critério do piloto.

1. Nova empresa: nome, nome de exibição, slug, CNPJ, contatos; primeiro superadmin (e-mail do responsável da funerária).
2. Identidade visual: logo (PNG/JPG/WEBP) + cores; conferir a prévia.
3. Entregar à funerária: endereço do painel (`https://app2.campax.com.br/admin`), credenciais (por um canal separado
   do e-mail com o login) e o roteiro [`docs/onboarding/roteiro-funeraria.md`](../onboarding/roteiro-funeraria.md)
   (primeiro acesso, câmeras em H.264 e liberadas só para o IP da Campax, salas, velório, ensaio, problemas comuns).
   Antes de entregar, preencher o WhatsApp de suporte.
4. Câmeras da funerária: como as câmeras puxam de fora, **o roteador dela precisa expor o RTSP** para o IP da VPS. A
   Campax orienta essa configuração e valida pelo status na tela de Câmeras.
5. **Ensaio antes do primeiro velório real**: a funerária cria um "velório de teste" com início imediato, abre pelo
   celular via token e pelo link da sala, registra uma homenagem e confere o relatório de acessos. A Campax acompanha.

## Etapa 3 — Operação do piloto (sugestão: 30 dias ou 10 velórios, o que vier depois)

### Monitoramento

- **Diário (5 min)**: `pm2 status` e reinícios (`↺`); `pm2 logs --err --lines 100` do backend e do sync; espaço em
  disco; backup do dia presente.
- **Por velório da funerária piloto**: acessos no relatório, visitantes, homenagens; qualquer reclamação de "não abre" ou
  "travando".
- **Isolamento em produção (semanal)**: `scripts/check-isolamento.sh [banco]` roda `backend/scripts/check-isolamento.sql`
  (só leitura; 8 checagens: velório × sala, câmera × sala, câmera × velório, log × velório, termo × velório, papel ×
  empresa, criador do velório × empresa, prefixo do caminho do MediaMTX) e sai com erro se alguma não for zero.
  Agendado em `/etc/cron.d/campax-check-isolamento` (segunda-feira, 04:00 de Brasília), com log em
  `logs/check-isolamento.log`. *(Implementado em 2026-09-23. Validado: no `campax` tudo zerado; um vínculo câmera/sala entre
  empresas plantado de propósito no `campax_dev` foi detectado.)*

### Capacidade (P6 e durante o piloto)

A VPS tem **2 vCPU e 3,7 GB de RAM** (2,6 GB disponíveis hoje), e tudo roda nela: Postgres, backend, frontend, sync,
MediaMTX e nginx-proxy-manager.
- **Antes do piloto:** medir CPU, RAM e banda de saída do MediaMTX com 1 câmera e 20 leitores WebRTC simultâneos (script
  de carga com navegadores headless ou `whep` client), e registrar os números nesta spec.
- **Durante:** anotar o pico de leitores simultâneos por velório (a presença do Socket.IO já conta) e o uso de CPU e
  banda no mesmo horário.
- **Gatilho de ação:** CPU > 70 % ou banda > 60 % do contratado em pico → avaliar uma VPS maior ou separar o MediaMTX
  antes do 3º cliente.

#### Teste leve de capacidade — 2026-09-23 (P6, parcial)

Câmera `uruacu2` (H.264, ~2,3 Mbps), espectadores WebRTC em Google Chrome headless **rodando na própria VPS**, medindo
só o container do MediaMTX (CPU pelo `docker stats`; tráfego pela `eth0` do container):

| Espectadores | CPU MediaMTX | Memória MediaMTX | Saída | Entrada (câmera) | Load da VPS |
|---:|---:|---:|---:|---:|---:|
| 0 | 0,2 % | 19 MiB | 0,02 Mbps | 0 | 0,3 |
| 1 | 4,3 % | 29 MiB | 2,37 Mbps | 2,34 Mbps | 0,4 |
| 5 | 12,5 % | 47 MiB | 11,8 Mbps | 2,32 Mbps | 4,6 |
| 10 | 55–60 % | 70–73 MiB | 159–177 Mbps ⚠ | 2,6 Mbps | 11–14 ⚠ |

- **Válido (1 a 5 espectadores):** cada espectador custa **~2,35 Mbps de saída** (a própria taxa da câmera; o MediaMTX
  não recodifica), **~2 % de um vCPU** e **~4–5 MB de RAM**. A câmera é puxada **uma vez só**, não importa quantos assistam.
- **Inválido (10):** os 10 Chromes decodificando vídeo na mesma VPS de 2 vCPUs a saturaram (load 11–14), os clientes
  perderam pacotes e pediram retransmissões em massa, e a saída foi 7x acima do linear. **Não representa espectadores
  reais**, que decodificam no próprio aparelho.
- **Estimativa linear** (a confirmar com carga vinda de fora): 20 espectadores numa câmera ≈ **47 Mbps**, ~40 % de um vCPU,
  ~110 MB; 50 espectadores somando velórios ao mesmo tempo ≈ **118 Mbps** e ~1 vCPU.
- **O limite provável é banda e franquia de tráfego, não CPU:** um espectador por 3 h ≈ **3,2 GB**; um velório de 3 h com
  20 espectadores ≈ **63 GB**. É preciso conferir no plano da VPS a velocidade da porta e a franquia mensal. Reduzir a
  câmera para ~1–1,5 Mbps (720p) quase divide esses números por dois.
- **Pendente para fechar o P6:** repetir com carga gerada **de fora da VPS** (outra máquina ou VPS temporária),
  com 20 espectadores.

### Suporte

- Canal único com a funerária (WhatsApp da Campax) e uma planilha de incidentes: data, empresa, sintoma, causa, correção.
- O `platform_admin` resolve senha esquecida e usuário bloqueado pelo `/platform`. Qualquer coisa que exija banco ou
  SSH vai para a planilha, com um "por que o painel não resolveu?". Essa é a lista de melhorias da plataforma.

## Critérios de sucesso do piloto

- [ ] **Zero** vazamento entre empresas: script semanal sempre com 0 linhas, e nenhuma ocorrência relatada.
- [ ] **Zero** indisponibilidade da funerária atual causada pelo multiempresa.
- [ ] ≥ 95 % dos velórios da funerária piloto transmitidos sem incidente que exija intervenção da Campax.
- [ ] Cadastro e operação do dia a dia da funerária piloto **sem intervenção no banco**.
- [ ] Números de capacidade registrados e dentro do gatilho.
- [ ] Planilha de incidentes revisada; itens críticos resolvidos ou com spec.

## Decisão ao fim do piloto

Com os critérios em mãos, escolher um caminho:
1. **Abrir para novos clientes**, e priorizar as specs pós-MVP: subdomínio (F7), limites por plano e cobrança,
   personificação para suporte (Q3).
2. **Estender o piloto**, se houver critério não cumprido com causa conhecida e corrigível.
3. **Revisar a arquitetura**, se houver problema de isolamento ou capacidade que a arquitetura atual não resolve.

## Fora de escopo

- Material comercial, preço e contrato-modelo (P4 é só o contrato do piloto).
- Automação de onboarding (cadastro pela própria funerária).
- Painel de monitoramento; no piloto, os comandos acima bastam.
