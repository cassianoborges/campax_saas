# Guia Completo de Deploy no Linux - Campax

Este guia fornece instruções detalhadas para fazer o deploy do projeto Campax em um servidor Linux (Ubuntu/Debian).

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Preparação do Servidor](#preparação-do-servidor)
3. [Instalação de Dependências](#instalação-de-dependências)
4. [Configuração do Projeto](#configuração-do-projeto)
5. [Configuração do PM2](#configuração-do-pm2)
6. [Configuração do Nginx](#configuração-do-nginx)
7. [Configuração de SSL/HTTPS](#configuração-de-sslhttps)
8. [Configuração do Firewall](#configuração-do-firewall)
9. [MediaMTX Setup](#mediamtx-setup)
10. [Troubleshooting](#troubleshooting)

---

## Pré-requisitos

- Servidor Linux (Ubuntu 20.04+ ou Debian 11+ recomendado)
- Acesso SSH ao servidor
- Usuário com privilégios sudo
- Domínio apontando para o IP do servidor (para SSL)

---

## Preparação do Servidor

### 1. Atualizar o sistema

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Criar usuário para a aplicação (opcional, mas recomendado)

```bash
# Criar usuário
sudo adduser campax

# Adicionar ao grupo sudo (se necessário)
sudo usermod -aG sudo campax

# Trocar para o novo usuário
su - campax
```

### 3. Configurar SSH (opcional)

```bash
# Copiar chaves SSH para o novo usuário
sudo mkdir -p /home/campax/.ssh
sudo cp ~/.ssh/authorized_keys /home/campax/.ssh/
sudo chown -R campax:campax /home/campax/.ssh
sudo chmod 700 /home/campax/.ssh
sudo chmod 600 /home/campax/.ssh/authorized_keys
```

---

## Instalação de Dependências

### 1. Instalar Node.js (v18 ou superior)

```bash
# Instalar NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recarregar o shell
source ~/.bashrc

# Instalar Node.js LTS
nvm install --lts
nvm use --lts

# Verificar instalação
node --version
npm --version
```

**Alternativa: Instalar via NodeSource**

```bash
# Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalação
node --version
npm --version
```

### 2. Instalar PM2

```bash
npm install -g pm2
```

### 3. Instalar Git

```bash
sudo apt install -y git
```

### 4. Instalar Nginx

```bash
sudo apt install -y nginx
```

---

## Configuração do Projeto

### 1. Clonar o repositório

```bash
# Criar diretório para aplicações
mkdir -p ~/apps
cd ~/apps

# Clonar o projeto
git clone <URL_DO_SEU_REPOSITORIO> campax
cd campax
```

### 2. Instalar dependências

```bash
# Instalar dependências do frontend
npm install

# Instalar dependências do backend
cd backend
npm install
cd ..

# Instalar dependências do mediamtx-sync
cd mediamtx-sync
npm install
cd ..
```

### 3. Configurar variáveis de ambiente

Cada parte tem o seu `.env` (o backend e o mediamtx-sync têm um `.env.example` com todas as variáveis comentadas):

```bash
cp backend/.env.example backend/.env
cp mediamtx-sync/.env.example mediamtx-sync/.env
nano .env               # frontend
nano backend/.env
nano mediamtx-sync/.env
```

Frontend (`.env` na raiz, lido no build — mudar exige `npm run build` de novo):

```env
VITE_API_URL=https://backend.seu-dominio.com
VITE_BASE_DOMAIN=seu-dominio.com   # vazio = sem subdomínio por funerária
```

Backend (`backend/.env`): `DATABASE_URL` (Postgres local), `JWT_SECRET`, `FRONTEND_ORIGIN`, `BASE_DOMAIN`,
`MEDIAMTX_SYNC_URL`, `MEDIAMTX_AUTH_KEY`, `MEDIAMTX_API_USER`, `MEDIAMTX_API_PASSWORD` — ver `backend/.env.example`.

mediamtx-sync (`mediamtx-sync/.env`): `DATABASE_URL` (o mesmo Postgres), `MEDIAMTX_BASE_URL`, `MEDIAMTX_API_PORT`,
`MEDIAMTX_WEBRTC_BASE_URL`, `MEDIAMTX_USER`, `MEDIAMTX_PASSWORD`, `PORT`, `SYNC_INTERVAL`.

> [!IMPORTANT]
> Nunca commite arquivos `.env` no Git. Eles devem conter informações sensíveis.

### 4. Build do projeto

```bash
# Build do frontend
npm run build

# Build do backend (também roda prisma generate)
cd backend
npm run build
cd ..

# Build do mediamtx-sync
cd mediamtx-sync
npm run build
cd ..
```

### 5. Criar diretório de logs

```bash
mkdir -p logs
```

---

## Configuração do PM2

### 1. Iniciar aplicação com PM2

```bash
npm run pm2:start
```

### 2. Verificar status

```bash
pm2 status
```

### 3. Configurar inicialização automática

```bash
# Gerar script de startup (NÃO use sudo aqui)
pm2 startup systemd

# Execute o comando que o PM2 mostrar (este SIM precisa de sudo)
# Exemplo: sudo env PATH=$PATH:/home/campax/.nvm/versions/node/v20.x.x/bin pm2 startup systemd -u campax --hp /home/campax

# Salvar a lista de processos
pm2 save
```

### 4. Testar reinicialização

```bash
# Reiniciar o servidor e verificar se os processos iniciam automaticamente
sudo reboot

# Após reiniciar, conectar via SSH e verificar
pm2 status
```

---

## Configuração do Nginx

### 1. Criar configuração do site

```bash
sudo nano /etc/nginx/sites-available/campax
```

Adicione a seguinte configuração:

```nginx
server {
    listen 80;
    listen [::]:80;
    
    server_name seu-dominio.com www.seu-dominio.com;
    
    # Logs
    access_log /var/log/nginx/campax-access.log;
    error_log /var/log/nginx/campax-error.log;
    
    # Proxy para a aplicação
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support para streaming
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

### 2. Habilitar o site

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/campax /etc/nginx/sites-enabled/

# Remover configuração padrão (opcional)
sudo rm /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx
```

### 3. Verificar status do Nginx

```bash
sudo systemctl status nginx
```

---

## Configuração de SSL/HTTPS

### Usando Certbot (Let's Encrypt - Gratuito)

### 1. Instalar Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Obter certificado SSL

```bash
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com
```

Siga as instruções:
- Digite seu email
- Aceite os termos de serviço
- Escolha se deseja redirecionar HTTP para HTTPS (recomendado: sim)

### 3. Renovação automática

```bash
# Testar renovação
sudo certbot renew --dry-run

# O Certbot já configura renovação automática via systemd timer
sudo systemctl status certbot.timer
```

### Configuração Manual do Nginx com SSL

Se você já tem certificados SSL, configure manualmente:

```bash
sudo nano /etc/nginx/sites-available/campax
```

```nginx
# Redirecionar HTTP para HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name seu-dominio.com www.seu-dominio.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name seu-dominio.com www.seu-dominio.com;
    
    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    
    # Configurações SSL recomendadas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Logs
    access_log /var/log/nginx/campax-access.log;
    error_log /var/log/nginx/campax-error.log;
    
    # Proxy para a aplicação
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Recarregar Nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## Configuração do Firewall

### Usando UFW (Uncomplicated Firewall)

```bash
# Instalar UFW (se não estiver instalado)
sudo apt install -y ufw

# Permitir SSH (IMPORTANTE: faça isso ANTES de habilitar o firewall)
sudo ufw allow ssh
sudo ufw allow 22/tcp

# Permitir HTTP e HTTPS
sudo ufw allow 'Nginx Full'
# Ou manualmente:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Se estiver usando MediaMTX com portas específicas
sudo ufw allow 8554/tcp  # RTSP
sudo ufw allow 1935/tcp  # RTMP
sudo ufw allow 8888/tcp  # HLS
sudo ufw allow 8889/tcp  # WebRTC

# Habilitar firewall
sudo ufw enable

# Verificar status
sudo ufw status verbose
```

---

## MediaMTX Setup

Se você estiver usando o MediaMTX para streaming:

### 1. Baixar MediaMTX

```bash
cd ~/apps
wget https://github.com/bluenviron/mediamtx/releases/download/v1.5.0/mediamtx_v1.5.0_linux_amd64.tar.gz
tar -xzf mediamtx_v1.5.0_linux_amd64.tar.gz
mkdir mediamtx
mv mediamtx mediamtx/
mv mediamtx.yml mediamtx/
```

### 2. Configurar MediaMTX

```bash
cd mediamtx
nano mediamtx.yml
```

Ajuste as configurações conforme necessário.

### 3. Criar serviço systemd para MediaMTX

```bash
sudo nano /etc/systemd/system/mediamtx.service
```

```ini
[Unit]
Description=MediaMTX Server
After=network.target

[Service]
Type=simple
User=campax
WorkingDirectory=/home/campax/apps/mediamtx
ExecStart=/home/campax/apps/mediamtx/mediamtx /home/campax/apps/mediamtx/mediamtx.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Iniciar MediaMTX
sudo systemctl start mediamtx

# Habilitar inicialização automática
sudo systemctl enable mediamtx

# Verificar status
sudo systemctl status mediamtx
```

---

## Troubleshooting

### Verificar logs da aplicação

```bash
# Logs do PM2
pm2 logs

# Logs específicos
pm2 logs campax-frontend-velorio
pm2 logs campax-sync-velorio

# Logs do Nginx
sudo tail -f /var/log/nginx/campax-error.log
sudo tail -f /var/log/nginx/campax-access.log

# Logs do sistema
sudo journalctl -u nginx -f
sudo journalctl -u mediamtx -f
```

### Porta já em uso

```bash
# Verificar o que está usando a porta 8080
sudo lsof -i :8080

# Ou usando netstat
sudo netstat -tulpn | grep :8080

# Matar processo se necessário
sudo kill -9 <PID>
```

### Nginx não inicia

```bash
# Verificar configuração
sudo nginx -t

# Ver logs de erro
sudo tail -f /var/log/nginx/error.log

# Verificar status
sudo systemctl status nginx
```

### PM2 não inicia após reboot

```bash
# Verificar se o startup está configurado
pm2 startup

# Salvar configuração novamente
pm2 save

# Verificar logs do systemd
sudo journalctl -u pm2-campax -f
```

### Backend não conecta ao banco

```bash
# Verificar o DATABASE_URL (backend e mediamtx-sync usam o mesmo Postgres local)
grep DATABASE_URL backend/.env mediamtx-sync/.env

# Postgres de pé e escutando só em 127.0.0.1:5432
sudo systemctl status postgresql
pg_isready -h 127.0.0.1 -p 5432

# Erro de conexão aparece aqui
pm2 logs campax-backend-velorio --err
```

### Problemas de permissão

```bash
# Ajustar permissões do projeto
sudo chown -R campax:campax ~/apps/campax

# Ajustar permissões de logs
sudo chown -R campax:campax ~/apps/campax/logs
```

---

## Comandos Úteis de Manutenção

### Atualizar aplicação

```bash
cd ~/apps/campax

# Parar PM2
pm2 stop all

# Atualizar código
git pull origin main

# Reinstalar dependências (se necessário)
npm install
cd mediamtx-sync && npm install && cd ..

# Rebuild
npm run build
cd mediamtx-sync && npm run build && cd ..

# Reiniciar PM2
pm2 restart all
```

### Backup

```bash
# Backup do código
tar -czf campax-backup-$(date +%Y%m%d).tar.gz ~/apps/campax

# Backup de configurações
sudo tar -czf nginx-backup-$(date +%Y%m%d).tar.gz /etc/nginx/sites-available/campax
```

### Monitoramento

```bash
# Monitoramento em tempo real com PM2
pm2 monit

# Uso de recursos do servidor
htop

# Espaço em disco
df -h

# Uso de memória
free -h
```

---

## Checklist de Deploy

- [ ] Servidor atualizado
- [ ] Node.js instalado
- [ ] PM2 instalado
- [ ] Nginx instalado
- [ ] Projeto clonado
- [ ] Dependências instaladas
- [ ] Variáveis de ambiente configuradas
- [ ] Build realizado
- [ ] PM2 iniciado e configurado para startup
- [ ] Nginx configurado
- [ ] SSL configurado (se aplicável)
- [ ] Firewall configurado
- [ ] MediaMTX configurado (se aplicável)
- [ ] Testes de acesso realizados
- [ ] Logs verificados

---

## Recursos Adicionais

- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [MediaMTX Documentation](https://github.com/bluenviron/mediamtx)
- [UFW Guide](https://help.ubuntu.com/community/UFW)

---

## Suporte

Para mais informações sobre o projeto, consulte:
- [README.md](../README.md)
- [CLAUDE.md](../CLAUDE.md) — arquitetura, portas, domínios e variáveis de ambiente

---

## Backup e restauração do banco

O Postgres local (`campax`) é o único lugar onde os dados da aplicação existem. O backup é diário e é
verificado com um teste de restauração.

| Item | Onde |
|------|------|
| Script de backup | `scripts/backup-db.sh` (`pg_dump -Fc`, mantém 14 dias) |
| Agendamento | `/etc/cron.d/campax-backup`: todo dia às 06:30 UTC (03:30 em Brasília) |
| Arquivos | `/root/backups/campax/campax-AAAAMMDD-HHMM.dump` (diretório `700`, arquivos `600`) |
| Log | `/root/campax/logs/backup.log` |
| Teste de restauração | `scripts/restore-check.sh [arquivo]` |

Backup manual (obrigatório antes de qualquer deploy que altere o schema):

```bash
/root/campax/scripts/backup-db.sh
```

Teste de restauração: restaura o dump mais recente (ou o informado) num banco temporário
`campax_restore_check`, compara a contagem de linhas de todas as tabelas com a produção e apaga o banco temporário:

```bash
/root/campax/scripts/restore-check.sh
```

Restauração real (desastre ou rollback de deploy). **Isso substitui os dados de produção:**

```bash
pm2 stop campax-backend-velorio campax-sync-velorio
sudo -u postgres pg_restore --clean --if-exists -d campax < /root/backups/campax/<arquivo>.dump
pm2 start campax-backend-velorio campax-sync-velorio
```

Registro dos testes de restauração:

| Data | Arquivo | Resultado |
|------|---------|-----------|
| 2026-09-23 | `campax-20260923-1827.dump` | ok: 13 tabelas, contagens idênticas à produção |

Os backups ficam **na mesma VPS**, o que protege contra erro humano e migração malsucedida, mas não contra perda do
servidor. Uma cópia externa (outro servidor ou storage) é uma melhoria futura.

---

## MediaMTX: portas e autenticação

O MediaMTX roda via `/root/mediamtx/docker-compose.yml`, com a configuração em `/root/mediamtx/mediamtx.yml`
(fora do repositório; backups `*.bak-20260923`). Referência: `docs/multiempresa/06-mediamtx-sync.md`.

- **Portas públicas:** 8889 (WebRTC, via `media2.campax.com.br`), 8189/udp (mídia WebRTC) e 9997 (API, via
  `apicam.campax.com.br`, com senha). **Só locais (`127.0.0.1`):** 8554 (RTSP), 1935 (RTMP) e 8888 (HLS).
- **Autenticação:** `authMethod: http` → `http://172.18.0.1:3013/internal/mediamtx/auth/<MEDIAMTX_AUTH_KEY>` (backend).
  Leitura só com `?t=<token>` de um velório no ar (a API pública do velório entrega o `stream_url` pronto); API só com
  `MEDIAMTX_API_USER`/`MEDIAMTX_API_PASSWORD` do `backend/.env` (as mesmas do `mediamtx-sync/.env`). Se trocar a
  senha da API, troque nos dois `.env`.
- **Depois de reiniciar ou recriar o container,** os caminhos das câmeras (criados pela API) somem até o próximo ciclo do
  sync (≤ 30 s). Para ser imediato: `curl -X POST http://127.0.0.1:3002/webhook/camera-change`.
- **Se o backend estiver fora do ar,** o MediaMTX nega tudo, inclusive a API usada pelo sync.
