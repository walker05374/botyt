#!/bin/bash

echo "🤖 INICIANDO INSTALAÇÃO AUTOMÁTICA DO BOT..."
echo "Isso pode levar alguns minutos. Por favor, aguarde."

# 1. Atualizar repositórios e sistema
echo "📦 Atualizando sistema..."
pkg update -y && pkg upgrade -y

# 2. Instalar dependências essenciais
echo "🛠️ Instalando ferramentas (Node, Git, FFmpeg, Python)..."
pkg install nodejs git ffmpeg python -y

# 3. Configurar armazenamento
echo "📂 Configurando permissões de armazenamento..."
echo "⚠️ ATENÇÃO: Se aparecer um pop-up pedindo permissão, clique em PERMITIR/ALLOW."
termux-setup-storage
sleep 3


# 4. Instalar dependências do projeto (npm)
echo "📚 Instalando bibliotecas do bot..."
if [ -f "package.json" ]; then
    # Fix para Android: Remove ffmpeg-static que não é compatível
    if grep -q "com.termux" <<< "$PREFIX"; then
        echo "📱 Detectado Android/Termux: Removendo ffmpeg-static incompatível..."
        npm uninstall ffmpeg-static
    fi

    npm install
else
    echo "⚠️ package.json não encontrado! Certifique-se de estar na pasta do bot."
fi

# 5. Configurar Wake Lock (Para rodar em segundo plano)
echo "🔋 Ativando Wake Lock (Para rodar com tela desligada)..."
termux-wake-lock

echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo "-------------------------------------------"
echo "Para iniciar o bot agora, digite:"
echo "node iniciar.js"
echo "-------------------------------------------"
