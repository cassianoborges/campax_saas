# Guia Rápido de Deploy Linux - Campax

Este é um guia rápido para fazer o deploy do Campax em um servidor Linux. Para instruções detalhadas, consulte [linux-deployment.md](./linux-deployment.md).

## Pré-requisitos

- Servidor Linux (Ubuntu 20.04+ ou Debian 11+)
- Acesso SSH com sudo
- Node.js 18+ instalado
- Domínio apontando para o servidor (para SSL)

## Deploy Rápido (5 passos)

### 1. Instalar Node.js e PM2

```bash
# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2
npm install -g pm2
```

### 2. Clonar e configurar o projeto

```bash
# Clonar repositório
git clone <URL_DO_REPOSITORIO> ~/apps/campax
cd ~/apps/campax

# Configurar variáveis de ambiente
nano .env
# Adicione: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

nano mediamtx-sync/.env
# Adicione as variáveis do MediaMTX
```

### 3. Executar script de deploy

```bash
# Dar permissão de execução
chmod +x deploy-linux.sh

# Executar script
./deploy-linux.sh
```

O script irá:
- ✓ Verificar dependências
- ✓ Instalar pacotes npm
- ✓ Fazer build do projeto
- ✓ Iniciar com PM2
- ✓ Configurar logs

### 4. Configurar Nginx

```bash
# Instalar Nginx
sudo apt install -y nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/campax
```

Cole esta configuração básica:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Habilitar site
sudo ln -s /etc/nginx/sites-available/campax /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Configurar SSL (opcional mas recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado SSL
sudo certbot --nginx -d seu-dominio.com
```

## Verificação

```bash
# Verificar status do PM2
pm2 status

# Ver logs
pm2 logs

# Verificar Nginx
sudo systemctl status nginx

# Testar acesso
curl http://localhost:8080
```

## Comandos Úteis

```bash
# Reiniciar aplicação
pm2 restart all

# Ver logs em tempo real
pm2 logs

# Monitoramento
pm2 monit

# Parar aplicação
pm2 stop all

# Atualizar código
cd ~/apps/campax
git pull
npm run build
cd mediamtx-sync && npm run build && cd ..
pm2 restart all
```

## Configurar Inicialização Automática

```bash
# Gerar script de startup
pm2 startup systemd

# Execute o comando que o PM2 mostrar (com sudo)

# Salvar configuração
pm2 save
```

## Firewall (UFW)

```bash
# Permitir SSH, HTTP e HTTPS
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Estrutura de Diretórios

```
~/apps/campax/
├── dist/                 # Build do frontend
├── mediamtx-sync/        # Serviço de sincronização
│   └── dist/            # Build do sync service
├── logs/                 # Logs do PM2
├── .env                  # Variáveis de ambiente
└── ecosystem.config.js   # Configuração do PM2
```

## Troubleshooting

### Aplicação não inicia

```bash
pm2 logs campax-frontend-velorio --err
```

### Porta 8080 em uso

```bash
sudo lsof -i :8080
pm2 restart all
```

### Nginx não funciona

```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

## Próximos Passos

1. ✓ Aplicação rodando
2. ✓ Nginx configurado
3. ✓ SSL configurado
4. Configure backup automático
5. Configure monitoramento
6. Configure MediaMTX (se necessário)

## Documentação Completa

Para instruções detalhadas sobre:
- Configuração avançada do Nginx
- MediaMTX setup completo
- Troubleshooting detalhado
- Configurações de segurança
- Otimizações de performance

Consulte: **[linux-deployment.md](./linux-deployment.md)**

## Suporte

- [README Principal](../README.md)
- [Guia PM2](./pm2-deployment.md)
- [Deploy Linux Completo](./linux-deployment.md)
