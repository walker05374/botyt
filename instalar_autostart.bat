@echo off
echo Instalando bot na inicializacao do Windows...

set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BotWhatsapp.lnk"
set "TARGET_PATH=%SCRIPT_DIR%iniciar_invisivel.vbs"

echo Criando atalho para: %TARGET_PATH%

powershell "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%TARGET_PATH%';$s.WorkingDirectory='%SCRIPT_DIR%';$s.Save()"

echo.
echo ==================================================
echo ✅ INSTALADO COM SUCESSO!
echo O bot vai iniciar sozinho (e invisivel) quando ligar o PC.
echo ==================================================
pause
