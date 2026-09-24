# Campax - Eternal Streams

Sistema de gerenciamento de transmissões ao vivo para velórios.

## Tecnologias Utilizadas

- **Frontend**: React + TypeScript + Vite
- **UI Components**: shadcn-ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Streaming**: MediaMTX (WebRTC/HLS)

## Como Executar Localmente

```sh
# 1. Clone o repositório
git clone https://github.com/cassianoborges/campax.git

# 2. Entre no diretório do projeto
cd campax

# 3. Instale as dependências
npm install

# 4. Configure as variáveis de ambiente
# Copie o arquivo .env.example para .env e configure suas credenciais do Supabase

# 5. Execute o servidor de desenvolvimento
npm run dev
```

## Estrutura do Projeto

- `/src` - Código fonte da aplicação
  - `/pages` - Páginas da aplicação
  - `/components` - Componentes reutilizáveis
  - `/hooks` - Custom hooks
  - `/services` - Serviços de integração
- `/supabase` - Migrações e configurações do banco de dados
- `/mediamtx-sync` - Serviço de sincronização com MediaMTX
- `/docs` - Documentação do projeto

## Funcionalidades

- ✅ Gerenciamento de velórios
- ✅ Gerenciamento de câmeras
- ✅ Transmissão ao vivo via WebRTC/HLS
- ✅ Acesso público com código
- ✅ Dashboard administrativo
- ✅ Relatórios de acesso
- ✅ Auditoria de criação de velórios

## Deploy em Produção

### Deploy Rápido em Linux

Para fazer deploy em um servidor Linux, use o script automatizado:

```bash
chmod +x deploy-linux.sh
./deploy-linux.sh
```

### Documentação de Deploy

- **[Guia Rápido - Linux](./docs/linux-quick-start.md)** - Deploy em 5 passos
- **[Guia Completo - Linux](./docs/linux-deployment.md)** - Instruções detalhadas com Nginx, SSL e firewall
- **[Guia PM2](./docs/pm2-deployment.md)** - Gerenciamento de processos com PM2

### Requisitos para Produção

- Node.js 18+ 
- PM2 (gerenciador de processos)
- Nginx (reverse proxy)
- Certificado SSL (Let's Encrypt recomendado)
- Servidor Linux (Ubuntu 20.04+ ou Debian 11+)

## Licença

MIT
