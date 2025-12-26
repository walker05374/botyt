@echo off
echo ===========================================
echo       GERANDO EXECUTAVEL DO BOT
echo ===========================================
echo.
echo 1. Instalando dependencias (garantia)...
call npm install

echo.
echo 2. Criando executavel com Pkg...
call npx pkg . --targets node18-win-x64 --output dist/bot_whatsapp.exe

echo.
echo ===========================================
echo           CONCLUIDO!
echo ===========================================
echo O arquivo esta na pasta 'dist/bot_whatsapp.exe'
echo.
echo !IMPORTANTE!: Se o bot nao abrir, certifique-se que
echo o Google Chrome esta instalado no seu computador.
echo.
pause
