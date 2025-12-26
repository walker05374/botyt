const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// --- CONFIGURAÇÃO DO FFMPEG ---
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    console.log('⚠️ ffmpeg-static não encontrado, usando ffmpeg do sistema.');
    ffmpegPath = 'ffmpeg'; // No Termux, geralmente ele acha pelo nome
}
ffmpeg.setFfmpegPath(ffmpegPath);
console.log('FFmpeg Path:', ffmpegPath);

// Estado em memória
const userStates = {};

// --- CONFIGURAÇÃO DO CLIENTE (CORRIGIDA PARA TERMUX) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/data/data/com.termux/files/usr/bin/chromium', // Caminho do Chromium no Termux
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Importante para evitar travamentos no Android
            '--headless'        // Roda sem interface gráfica
        ]
    }
});

// --- GERAÇÃO DO QR CODE ---
client.on('qr', (qr) => {
    qrcode.toFile('./qr.png', qr, {
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function (err) {
        if (err) throw err;
        console.log('\n✅ QR Code gerado com sucesso!');
        console.log('📂 Arquivo criado: ' + path.join(__dirname, 'qr.png'));
        console.log('⚠️  DICA: Abra esse arquivo na galeria ou copie para o PC para escanear.\n');
    });
});

client.on('ready', () => {
    console.log('\n==================================================');
    console.log('🤖 BOT ONLINE E PRONTO PARA USO NO TERMUX!');
    console.log('==================================================');
    console.log('\n📋 Comandos Disponíveis:');
    console.log('   ➤ /baixar (link) -> Baixar vídeo/áudio');
    console.log('   ➤ /amor (respondendo mídia) -> Converter arquivo');
    console.log('   ➤ /ajuda -> Ver menu completo');
    console.log('\n==================================================\n');
});

// --- FUNÇÕES UTILITÁRIAS ---

// Limpeza de cache/temp na inicialização
const cleanTempFolder = () => {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir); // Cria se não existir
    } else {
        fs.readdirSync(tempDir).forEach(file => {
            const curPath = path.join(tempDir, file);
            try { fs.unlinkSync(curPath); } catch (e) { }
        });
        console.log('🧹 Pasta temp limpa com sucesso!');
    }
};
cleanTempFolder();

const isYoutubeLink = (text) => {
    const match = text.match(/((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?/);
    return match ? match[0] : null;
};

// Verificar binário yt-dlp
(async () => {
    const isWindows = os.platform() === 'win32';
    const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';

    // Tenta usar o do sistema primeiro (instalado via pip no Termux)
    if (fs.existsSync('/data/data/com.termux/files/usr/bin/yt-dlp')) {
        ytDlpWrap.setBinaryPath('/data/data/com.termux/files/usr/bin/yt-dlp');
        console.log('✅ Usando yt-dlp do sistema Termux.');
    } else {
        // Fallback para baixar o binário localmente
        const binaryPath = path.join(__dirname, binaryName);
        ytDlpWrap.setBinaryPath(binaryPath);

        if (!fs.existsSync(binaryPath)) {
            console.log('⚠️ Binário yt-dlp não encontrado. Baixando versão mais recente...');
            try {
                await YTDlpWrap.downloadFromGithub(binaryPath);
                fs.chmodSync(binaryPath, '755'); // Dá permissão de execução
                console.log('✅ yt-dlp baixado com sucesso!');
            } catch (e) {
                console.error('❌ Erro ao baixar yt-dlp:', e);
            }
        } else {
            console.log('✅ Binário yt-dlp local encontrado.');
        }
    }
})();

// --- LÓGICA DE MENSAGENS ---
client.on('message', async msg => {
    const chatId = msg.from;
    const text = msg.body.trim();

    // Cancelar
    if (text.toLowerCase() === '!cancelar') {
        delete userStates[chatId];
        msg.reply('Operação cancelada.');
        return;
    }

    // AJUDA
    if (['/ajuda', '!ajuda', '!help'].includes(text.toLowerCase())) {
        const helpText = `🤖 *Manual do Bot* 🤖\n\n` +
            `1️⃣ *Baixar do YouTube*:\n` +
            `Use */baixar* (ou @baixar) seguido do link.\n` +
            `Ex: */baixar https://youtu.be/...*\n\n` +
            `2️⃣ *Converter Mídia (Áudio/Vídeo)*:\n` +
            `Responda a um vídeo ou áudio com */converter* (ou @converter).\n\n` +
            `3️⃣ *Conversão em Lote*:\n` +
            `Envie vários arquivos e digite */converter* no final para processar todos.\n\n` +
            `❌ *Cancelar*:\n` +
            `Digite *!cancelar* a qualquer momento.`;
        msg.reply(helpText);
        return;
    }

    // COMANDO 1: BAIXAR DO YOUTUBE (/baixar ou @baixar)
    if (['/baixar', '@baixar', '!baixar'].includes(text.toLowerCase().split(' ')[0])) {
        let linksToProcess = [];

        // 1. Verifica se tem link na própria mensagem
        const directLink = isYoutubeLink(text);
        if (directLink) {
            linksToProcess.push(directLink);
        } else {
            // 2. Se não tem, verifica histórico ou citações
            if (msg.hasQuotedMsg) {
                const quoted = await msg.getQuotedMessage();
                const quotedLink = isYoutubeLink(quoted.body);
                if (quotedLink) linksToProcess.push(quotedLink);
            } else {
                // Busca últimas mensagens para achar links
                const chat = await msg.getChat();
                const fetched = await chat.fetchMessages({ limit: 10 });

                // Filtra mensagens do usuário com links recentes
                fetched.forEach(m => {
                    if (!m.fromMe && (Date.now() / 1000 - m.timestamp) < 300) {
                        const l = isYoutubeLink(m.body);
                        if (l) linksToProcess.push(l);
                    }
                });
            }
        }

        // Remove duplicatas
        linksToProcess = [...new Set(linksToProcess)];

        if (linksToProcess.length === 0) {
            msg.reply('⚠️ Nenhum link do YouTube encontrado.\nEnvie o link junto com o comando ou logo antes.');
            return;
        }

        msg.reply(`🔎 Encontrei ${linksToProcess.length} link(s). Escolha o formato para baixar TODOS:\n\n*1*. MP3 (Áudio)\n*2*. MP4 (Vídeo - Melhor Qualidade)\n\nResponda com o número.`);

        userStates[chatId] = {
            step: 'BATCH_DOWNLOAD',
            links: linksToProcess
        };
        return;
    }

    // COMANDO 2: CONVERTER MÍDIA (/converter ou @converter ou /amor)
    if (['/converter', '@converter', '!converter', '/amor', '@amor'].includes(text.toLowerCase().split(' ')[0])) {

        let targetMsgs = [];

        if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) {
                targetMsgs.push(quoted);
            }
        } else {
            // Se não citou nada, busca as últimas conversas
            const chat = await msg.getChat();
            const fetched = await chat.fetchMessages({ limit: 20 });

            // Filtra: enviadas pelo usuário, tem mídia, recentes (< 5min)
            targetMsgs = fetched.filter(m =>
                !m.fromMe &&
                m.hasMedia &&
                ['audio', 'video', 'voice'].includes(m.type) &&
                (Date.now() / 1000 - m.timestamp) < 300
            );
        }

        if (targetMsgs.length === 0) {
            msg.reply('❌ Nenhuma mídia encontrada para converter.\nResponda a um arquivo ou envie vários e digite */converter*.');
            return;
        }

        msg.reply(`💿 *${targetMsgs.length} arquivo(s)* detectado(s)! Escolha o formato para converter TODOS:\n\n*1*. MP3 (Áudio)\n*2*. OGG (Áudio/Voz)\n*3*. WAV (Áudio)\n*4*. MP4 (Vídeo)\n\nResponda com o número.`);

        userStates[chatId] = {
            step: 'BATCH_CONVERSION',
            msgs: targetMsgs
        };
        return;
    }

    // Fluxo Youtube: Processamento em Lote
    if (userStates[chatId] && userStates[chatId].step === 'BATCH_DOWNLOAD') {
        if (!/^\d+$/.test(text)) return;

        const choice = parseInt(text);
        if (choice !== 1 && choice !== 2) {
            msg.reply('⚠️ Opção inválida. Escolha 1 (MP3) ou 2 (MP4).');
            return;
        }

        const links = userStates[chatId].links;
        const type = choice === 1 ? 'audio' : 'video';
        delete userStates[chatId];

        msg.reply(`⏳ Baixando ${links.length} arquivo(s) em formato *${type === 'audio' ? 'MP3' : 'MP4'}*...`);

        for (const [index, link] of links.entries()) {
            try {
                const tempDir = path.join(__dirname, 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

                const baseFilename = `dl_${Date.now()}_${index}`;
                let args = [];

                if (type === 'audio') {
                    args = [
                        link,
                        '-x',
                        '--audio-format', 'mp3',
                        '-o', path.join(tempDir, `${baseFilename}.%(ext)s`),
                        '--no-check-certificates',
                        '--prefer-free-formats',
                        '--ffmpeg-location', path.dirname(ffmpegPath) || 'ffmpeg'
                    ];
                } else {
                    args = [
                        link,
                        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                        '--merge-output-format', 'mp4',
                        '-o', path.join(tempDir, `${baseFilename}.%(ext)s`),
                        '--no-check-certificates',
                        '--prefer-free-formats',
                        '--ffmpeg-location', path.dirname(ffmpegPath) || 'ffmpeg'
                    ];
                }

                await ytDlpWrap.execPromise(args);

                const files = fs.readdirSync(tempDir);
                const downloadedFile = files.find(f => f.startsWith(baseFilename) && !f.endsWith('.part'));

                if (downloadedFile) {
                    const filePath = path.join(tempDir, downloadedFile);
                    const media = MessageMedia.fromFilePath(filePath);

                    await client.sendMessage(chatId, media, {
                        sendMediaAsDocument: true,
                        caption: `(${index + 1}/${links.length}) ta ai gatona! 😺`
                    });

                    // Deleta após enviar
                    setTimeout(() => { try { fs.unlinkSync(filePath); } catch (e) { } }, 10000);
                } else {
                    client.sendMessage(chatId, `❌ Erro no download do item ${index + 1}`);
                }

                // Delay anti-spam
                await new Promise(r => setTimeout(r, 2000));

            } catch (e) {
                console.error(`Erro lote ${index}:`, e);
                client.sendMessage(chatId, `❌ Erro ao baixar item ${index + 1}`);
            }
        }

        client.sendMessage(chatId, '✅ Todos os downloads concluídos!');
        return;
    }
});

client.initialize();