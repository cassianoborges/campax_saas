#!/bin/bash

# Script de Deploy Automatizado - Campax
# Este script automatiza o processo de deploy em servidores Linux

set -e  # Parar em caso de erro

echo "========================================="
echo "  Campax - Script de Deploy Linux"
echo "========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Verificar se está rodando como root
if [ "$EUID" -eq 0 ]; then 
    print_error "Não execute este script como root!"
    exit 1
fi

# 1. Verificar Node.js
echo "1. Verificando Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js instalado: $NODE_VERSION"
else
    print_error "Node.js não encontrado!"
    print_info "Instale o Node.js antes de continuar:"
    print_info "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    print_info "sudo apt install -y nodejs"
    exit 1
fi

# 2. Verificar PM2
echo ""
echo "2. Verificando PM2..."
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    print_success "PM2 instalado: v$PM2_VERSION"
else
    print_warning "PM2 não encontrado. Instalando..."
    npm install -g pm2
    print_success "PM2 instalado com sucesso!"
fi

# 3. Verificar se está no diretório correto
echo ""
echo "3. Verificando diretório do projeto..."
if [ ! -f "package.json" ]; then
    print_error "package.json não encontrado!"
    print_error "Execute este script no diretório raiz do projeto."
    exit 1
fi
print_success "Diretório do projeto OK"

# 4. Verificar arquivos .env
echo ""
echo "4. Verificando arquivos de configuração..."
if [ ! -f ".env" ]; then
    print_warning "Arquivo .env não encontrado!"
    print_info "Crie o arquivo .env com as variáveis necessárias:"
    print_info "VITE_SUPABASE_URL=sua_url"
    print_info "VITE_SUPABASE_ANON_KEY=sua_chave"
    read -p "Deseja continuar mesmo assim? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Arquivo .env encontrado"
fi

if [ ! -f "mediamtx-sync/.env" ]; then
    print_warning "Arquivo mediamtx-sync/.env não encontrado!"
    read -p "Deseja continuar mesmo assim? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Arquivo mediamtx-sync/.env encontrado"
fi

# 5. Instalar dependências
echo ""
echo "5. Instalando dependências..."
print_info "Instalando dependências do frontend..."
npm install
print_success "Dependências do frontend instaladas"

print_info "Instalando dependências do mediamtx-sync..."
cd mediamtx-sync
npm install
cd ..
print_success "Dependências do mediamtx-sync instaladas"

# 6. Build do projeto
echo ""
echo "6. Fazendo build do projeto..."
print_info "Build do frontend..."
npm run build
print_success "Build do frontend concluído"

print_info "Build do mediamtx-sync..."
cd mediamtx-sync
npm run build
cd ..
print_success "Build do mediamtx-sync concluído"

# 7. Criar diretório de logs
echo ""
echo "7. Criando diretório de logs..."
mkdir -p logs
print_success "Diretório de logs criado"

# 8. Parar processos PM2 existentes (se houver)
echo ""
echo "8. Parando processos PM2 existentes..."
pm2 delete ecosystem.config.cjs 2>/dev/null || true
print_success "Processos anteriores removidos"

# 9. Iniciar com PM2
echo ""
echo "9. Iniciando aplicação com PM2..."
pm2 start ecosystem.config.cjs
print_success "Aplicação iniciada com PM2"

# 10. Salvar configuração PM2
echo ""
echo "10. Salvando configuração PM2..."
pm2 save
print_success "Configuração PM2 salva"

# 11. Configurar startup (opcional)
echo ""
echo "11. Configurando inicialização automática..."
print_info "Para configurar o PM2 para iniciar automaticamente:"
print_info "Execute: pm2 startup systemd"
print_info "Depois execute o comando que o PM2 mostrar (com sudo)"
read -p "Deseja configurar agora? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 startup systemd
    print_warning "Execute o comando mostrado acima (com sudo) e depois execute: pm2 save"
fi

# 12. Mostrar status
echo ""
echo "========================================="
echo "  Deploy Concluído!"
echo "========================================="
echo ""
pm2 status
echo ""
print_success "Aplicação rodando em http://localhost:8080"
echo ""
print_info "Comandos úteis:"
print_info "  pm2 status      - Ver status dos processos"
print_info "  pm2 logs        - Ver logs em tempo real"
print_info "  pm2 monit       - Monitoramento interativo"
print_info "  pm2 restart all - Reiniciar todos os processos"
print_info "  pm2 stop all    - Parar todos os processos"
echo ""
print_info "Próximos passos:"
print_info "  1. Configure o Nginx como reverse proxy"
print_info "  2. Configure SSL/HTTPS com Let's Encrypt"
print_info "  3. Configure o firewall (UFW)"
print_info "  Consulte: docs/linux-deployment.md"
echo ""
