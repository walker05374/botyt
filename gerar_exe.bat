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
copy LEIA_ME_ERROS.md dist\LEIA_ME.txt >nul
echo.
echo.
echo !IMPORTANTE!: Se o bot nao abrir ou o arquivo SUMIR,
echo e provavel que seu ANTIVIRUS (Windows Defender) tenha removido.
echo Adicione a pasta 'dist' as EXCECOES do seu Antivirus.
echo.
echo Certifique-se tambem que o Google Chrome esta instalado.
echo.
pause
