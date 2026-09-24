# PM2 Deployment Guide - Campax

Este guia explica como usar o PM2 para gerenciar o projeto Campax em produção.

## O que é PM2?

PM2 é um gerenciador de processos para aplicações Node.js que mantém suas aplicações rodando continuamente, reinicia automaticamente em caso de falhas e facilita o monitoramento.

## Pré-requisitos

- Node.js instalado (v18 ou superior)
- Projeto buildado (`npm run build`)
- PM2 instalado globalmente

## Instalação do PM2

```bash
npm install -g pm2
```

## Preparação do Projeto

Antes de iniciar com PM2, você precisa buildar o projeto:

```bash
# 1. Build do frontend
npm run build

# 2. Build do serviço MediaMTX Sync
cd mediamtx-sync
npm install
npm run build
cd ..

# 3. Instalar dependências de produção (se ainda não instalou)
npm install
```

## Comandos PM2

### Iniciar os serviços

```bash
npm run pm2:start
```

Este comando inicia dois processos:
- **campax-frontend-velorio**: Serve a aplicação React na porta 8080
- **campax-sync-velorio**: Serviço de sincronização de câmeras

### Verificar status dos processos

```bash
npm run pm2:status
```

Saída esperada:
```
┌─────┬──────────────────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id  │ name                     │ mode        │ ↺       │ status  │ cpu      │
├─────┼──────────────────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0   │ campax-frontend-velorio  │ fork        │ 0       │ online  │ 0%       │
│ 1   │ campax-sync-velorio      │ fork        │ 0       │ online  │ 0%       │
│ 2   │ campax-cam-status        │ fork        │ 0       │ online  │ 0%       │
└─────┴──────────────────────────┴─────────────┴─────────┴─────────┴──────────┘
```

### Visualizar logs

```bash
# Logs de todos os processos
npm run pm2:logs

# Logs apenas do frontend
pm2 logs campax-frontend-velorio

# Logs apenas do sync service
pm2 logs campax-sync-velorio

# Ver últimas 100 linhas
pm2 logs --lines 100
```

### Monitoramento em tempo real

```bash
npm run pm2:monit
```

Abre um dashboard interativo mostrando CPU, memória e logs em tempo real.

### Reiniciar serviços

```bash
# Reiniciar todos
npm run pm2:restart

# Reiniciar apenas um serviço
pm2 restart campax-frontend-velorio
pm2 restart campax-sync-velorio
```

### Parar serviços

```bash
# Parar todos
npm run pm2:stop

# Parar apenas um serviço
pm2 stop campax-frontend-velorio
pm2 stop campax-sync-velorio
```

### Remover serviços do PM2

```bash
npm run pm2:delete
```

## Configuração de Inicialização Automática

Para que os serviços iniciem automaticamente quando o servidor reiniciar:

### Windows

```bash
# Gerar script de startup
pm2 startup

# Salvar a lista de processos atual
pm2 save
```

### Linux/Ubuntu

```bash
# Gerar script de startup (execute como seu usuário, não como root)
pm2 startup systemd

# Copie e execute o comando que o PM2 mostrar
# Exemplo: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u usuario --hp /home/usuario

# Salvar a lista de processos
pm2 save
```

Para desabilitar o startup automático:
```bash
pm2 unstartup systemd
```

## Estrutura de Logs

Os logs são salvos no diretório `logs/` na raiz do projeto:

```
logs/
├── frontend-error.log    # Erros do frontend
├── frontend-out.log      # Output do frontend
├── sync-error.log        # Erros do sync service
└── sync-out.log          # Output do sync service
```

## Configuração Avançada

O arquivo `ecosystem.config.js` contém todas as configurações do PM2. Principais opções:

- **instances**: Número de instâncias (1 = single instance)
- **autorestart**: Reiniciar automaticamente em caso de crash
- **max_memory_restart**: Reiniciar se ultrapassar limite de memória
- **watch**: Monitorar mudanças em arquivos (desabilitado em produção)

## Troubleshooting

### Processo não inicia

```bash
# Verificar logs de erro
pm2 logs campax-frontend-velorio --err
pm2 logs campax-sync-velorio --err

# Verificar se o build foi feito
ls -la dist/
ls -la mediamtx-sync/dist/
```

### Porta 8080 já em uso

```bash
# Verificar o que está usando a porta
# Windows
netstat -ano | findstr :8080

# Linux
lsof -i :8080

# Matar o processo ou alterar a porta no ecosystem.config.js
```

### Serviço crashando constantemente

```bash
# Ver informações detalhadas
pm2 show campax-frontend-velorio
pm2 show campax-sync-velorio

# Verificar variáveis de ambiente
# Certifique-se de que os arquivos .env estão configurados corretamente
```

### Limpar logs antigos

```bash
pm2 flush
```

## Acessando a Aplicação

Após iniciar com PM2, acesse:

- **Frontend**: http://localhost:8080
- **MediaMTX Sync**: Roda em background (sem interface web)

## Comandos Úteis Adicionais

```bash
# Informações detalhadas de um processo
pm2 show campax-frontend-velorio

# Resetar contador de restarts
pm2 reset campax-frontend-velorio

# Recarregar (zero-downtime reload)
pm2 reload campax-frontend-velorio

# Listar todos os processos
pm2 list

# Salvar configuração atual
pm2 save

# Atualizar PM2
npm install -g pm2@latest
pm2 update
```

## Produção vs Desenvolvimento

- **Desenvolvimento**: Use `npm run dev` (hot reload, dev server)
- **Produção**: Use PM2 com build otimizado

## Próximos Passos

1. Configure um reverse proxy (Nginx/Apache) para servir na porta 80/443
2. Configure SSL/TLS para HTTPS
3. Configure backup automático dos logs
4. Configure monitoramento com PM2 Plus (opcional, pago)

## Configuração HTTPS para Produção

### Problema: Mixed Content Error

Se você acessar a aplicação via HTTPS (ex: `https://serpos.campax.com.br`) e receber o erro:

```
Mixed Content: The page was loaded over HTTPS, but requested an insecure frame 'http://...'
```

Isso ocorre porque o navegador bloqueia recursos HTTP quando a página é servida via HTTPS.

### Solução: Configurar MediaMTX com HTTPS

#### Opção A: Reverse Proxy (Recomendado)

Configure um reverse proxy (Nginx/Apache) com SSL para o MediaMTX:

**Exemplo Nginx:**
```nginx
server {
    listen 443 ssl;
    server_name media.campax.com.br;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8889;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Opção B: SSL Direto no MediaMTX

Configure SSL diretamente no MediaMTX (consulte documentação do MediaMTX).

### Atualizar Configuração do Sync Service

Após configurar HTTPS no MediaMTX:

1. **Editar arquivo `.env` do sync service:**
   ```bash
   cd mediamtx-sync
   nano .env
   ```

2. **Atualizar a URL base para HTTPS:**
   ```env
   # Antes
   MEDIAMTX_BASE_URL=http://37.27.206.169

   # Depois (use seu domínio HTTPS)
   MEDIAMTX_BASE_URL=https://media.campax.com.br
   ```

3. **Atualizar URLs existentes no banco de dados:**
   
   Execute o script SQL no Supabase SQL Editor:
   ```bash
   # O arquivo está em: update-urls-to-https.sql
   ```

   Ou execute manualmente:
   ```sql
   UPDATE cameras
   SET webrtc_url = REPLACE(webrtc_url, 'http://', 'https://')
   WHERE webrtc_url LIKE 'http://%';
   ```

4. **Rebuild e reiniciar o sync service:**
   ```bash
   cd mediamtx-sync
   npm run build
   cd ..
   pm2 restart campax-sync-velorio
   ```

5. **Verificar logs:**
   ```bash
   pm2 logs campax-sync-velorio --lines 50
   ```

   Você deve ver URLs HTTPS sendo geradas, por exemplo:
   ```
   ✅ Camera Nome: https://media.campax.com.br:8889/camera_path
   ```

### Verificação

1. **Verificar URLs no banco:**
   ```sql
   SELECT id, nome, webrtc_url FROM cameras WHERE ativo = true;
   ```
   Todas as URLs devem começar com `https://`

2. **Testar no navegador:**
   - Acesse `https://serpos.campax.com.br`
   - Entre com um token válido
   - Abra DevTools (F12) → Console
   - Não deve haver erros de "Mixed Content"
   - Clique no cadeado na barra de endereços → deve mostrar "Conexão segura"

## Recursos Adicionais

- [Documentação oficial do PM2](https://pm2.keymetrics.io/)
- [PM2 Quick Start](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Process Management](https://pm2.keymetrics.io/docs/usage/process-management/)
