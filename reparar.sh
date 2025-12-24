#!/bin/bash
echo "🔧 INICIANDO REPARO MANUAL DO ANDROID..."

# 1. Limpeza Bruta
echo "🗑️ Deletando pastas node_modules e arquivos de lock..."
rm -rf node_modules package-lock.json

# 2. Remoção do ffmpeg-static do package.json (Força Bruta)
# Isso remove a linha que contém "ffmpeg-static" do arquivo
echo "✂️ Removendo ffmpeg-static do package.json..."
sed -i '/ffmpeg-static/d' package.json

# 3. Limpeza de Cache do NPM (opcional, mas bom)
echo "🧹 Limpando cache do npm..."
npm cache clean --force

# 4. Instalação Limpa
echo "📦 Instalando dependências do zero..."
npm install

echo "---------------------------------------------------"
echo "✅ REPARO CONCLUÍDO!"
echo "Tente rodar o bot agora com:"
echo "node iniciar.js"
echo "---------------------------------------------------"
