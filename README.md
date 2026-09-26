# Campax - Eternal Streams

Sistema de gerenciamento de transmissões ao vivo para velórios, multiempresa: cada funerária configura suas
câmeras RTSP, salas e velórios, e o público assiste pelo navegador com um código de 6 caracteres.

## Tecnologias Utilizadas

- **Frontend**: React + TypeScript + Vite, shadcn-ui + Tailwind CSS
- **Backend** (`backend/`): Node.js + Express + Prisma, PostgreSQL local, autenticação JWT, Socket.IO
- **Streaming**: MediaMTX (WebRTC), sincronizado pelo serviço `mediamtx-sync/`

## Como Executar Localmente

```sh
git clone https://github.com/cassianoborges/campax_saas.git
cd campax_saas

# Frontend
npm install
npm run dev                  # http://localhost:8080 (VITE_API_URL padrão: http://localhost:3003)

# Backend (em outro terminal)
cd backend
npm install
cp .env.example .env.development   # ajuste DATABASE_URL, JWT_SECRET etc.
npm run dev                  # http://localhost:3003
npm test                     # usa o banco campax_test

# mediamtx-sync (opcional em dev)
cd mediamtx-sync
npm install
cp .env.example .env
npm run dev
```

## Estrutura do Projeto

- `/src` - Frontend (páginas, componentes, hooks, `lib/apiClient.ts`)
- `/backend` - API REST + Socket.IO, schema Prisma, testes de isolamento entre empresas
- `/mediamtx-sync` - Serviço que mantém os paths do MediaMTX em dia com as câmeras
- `/scripts` - Backup e teste de restauração do banco
- `/docs` - Deploy (`linux-deployment.md`), specs do multiempresa, onboarding de funerária
- `/supabase` - Migrações antigas, só como histórico do schema

## Funcionalidades

- ✅ Várias funerárias (empresas) isoladas, com identidade visual própria e subdomínio
- ✅ Gerenciamento de câmeras, salas e velórios
- ✅ Transmissão ao vivo via WebRTC
- ✅ Acesso público com código e link fixo por sala
- ✅ Homenagens e contagem de presença em tempo real
- ✅ Relatórios de acesso e auditoria
- ✅ Painel da plataforma (cadastro e suspensão de funerárias)

## Deploy em Produção

Produção roda com PM2 (`ecosystem.config.cjs`: frontend, backend e mediamtx-sync). Guia completo em
**[docs/linux-deployment.md](./docs/linux-deployment.md)**; portas, domínios e variáveis de ambiente em
[CLAUDE.md](./CLAUDE.md).

## Licença

MIT
