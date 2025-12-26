# Solução de Problemas: Executável Sumindo ou Não Abrindo

Se o arquivo `bot_whatsapp.exe` sumir da pasta `dist` ou fechar imediatamente após abrir, siga estes passos:

## 1. O arquivo sumiu? (Antivírus)
O Windows Defender ou seu antivírus pode classificar o arquivo como "Falso Positivo" porque ele não tem uma assinatura digital paga (comum para programas feitos em casa).

**Como resolver no Windows Defender:**
1. Abra o menu Iniciar e digite **Segurança do Windows**.
2. Vá em **Proteção contra vírus e ameaças**.
3. Clique em **Histórico de proteção**.
4. Procure por uma ameaça "Em quarentena" recente relacionada ao `bot_whatsapp.exe`.
5. Clique em **Ações** > **Restaurar** (ou **Permitir no dispositivo**).

**Para evitar que aconteça de novo:**
1. Vá em **Proteção contra vírus e ameaças** > **Gerenciar configurações**.
2. Role até **Exclusões** e clique em **Adicionar ou remover exclusões**.
3. Clique em **Adicionar uma exclusão** > **Pasta**.
4. Selecione a pasta `dist` dentro do projeto do bot.

## 2. O arquivo abre e fecha rápido? (Erro de Execução)
Isso significa que o bot tentou iniciar mas encontrou um erro.

**Como ver o erro:**
1. Não clique duas vezes no ícone.
2. Abra o arquivo `iniciar_bot.bat` (se existir) ou abra o **CMD** na pasta.
3. Arraste o `dist/bot_whatsapp.exe` para dentro da janela preta do CMD e aperte ENTER.
4. O erro aparecerá na tela.

**Erros comuns:**
- **Chromium não encontrado**: Instale o Google Chrome no computador.
- **Falha no ffmpeg**: Verifique se o `ffmpeg.exe` está na mesma pasta do bot.

## 3. Dica Importante
Sempre execute o arquivo `gerar_exe.bat` para criar uma nova versão atualizada se você mudou o código.
