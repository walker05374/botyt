const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
console.log('FFmpeg Path:', ffmpegPath);

// Estado em memória
const userStates = {};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disk-cache-size=0',
            '--disable-application-cache',
            '--disable-offline-load-stale-cache'
        ]
    }
});

client.on('qr', (qr) => {
    qrcode.toFile('./qr.png', qr, {
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function (err) {
        if (err) throw err;
        console.log('QR Code recebido! Um arquivo "qr.png" foi criado na pasta do projeto.');
        console.log('Por favor, abra o arquivo "qr.png" e escaneie com seu WhatsApp.');
    });
});

client.on('ready', () => {
    console.log('\n==================================================');
    console.log('🤖 BOT ONLINE E PRONTO PARA USO!');
    console.log('==================================================');
    console.log('\n📋 Comandos Disponíveis no WhatsApp:');
    console.log('   ➤ Envie um link do YouTube -> Baixar vídeo/áudio');
    console.log('   ➤ /amor (respondendo mídia) -> Converter arquivo');
    console.log('   ➤ /ajuda -> Ver menu completo no chat');
    console.log('\n💻 Comandos do Terminal:');
    console.log('   ➤ Ctrl + C -> Parar o bot');
    console.log('   ➤ npm run limpar -> Limpar arquivos temporários');
    console.log('\n==================================================\n');
});

// Limpeza de cache/temp na inicialização
const cleanTempFolder = () => {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
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

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Verificar binário
(async () => {
    const isWindows = os.platform() === 'win32';
    const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
    const binaryPath = path.join(__dirname, binaryName);
    ytDlpWrap.setBinaryPath(binaryPath);

    if (!fs.existsSync(binaryPath)) {
        console.log('⚠️  Binário yt-dlp não encontrado. Baixando versão mais recente...');
        try {
            await YTDlpWrap.downloadFromGithub(binaryPath);
            console.log('✅ yt-dlp baixado com sucesso!');
        } catch (e) {
            console.error('❌ Erro ao baixar yt-dlp:', e);
        }
    } else {
        console.log('✅ Binário yt-dlp encontrado.');
    }
})();

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
        // Encontra o link no texto
        const ytLink = isYoutubeLink(text);
        if (ytLink) {
            msg.reply('🔍 Analisando link do YouTube...');

            try {
                const jsonOutput = await ytDlpWrap.execPromise([
                    ytLink,
                    '--dump-json',
                    '--no-check-certificates',
                    '--no-warnings',
                    '--prefer-free-formats',
                    '--add-header', 'referer:youtube.com',
                    '--add-header', 'user-agent:googlebot',
                    '--ffmpeg-location', path.dirname(ffmpegPath)
                ]);

                const output = JSON.parse(jsonOutput);
                const formats = output.formats || [];
                const options = [];

                options.push({ type: 'audio', quality: 'MP3 (Audio Only)', id: 'audio-only', ext: 'mp3' });

                const availableHeights = [...new Set(formats.map(f => f.height).filter(h => h))].sort((a, b) => b - a);
                const idsAdded = new Set();

                availableHeights.forEach(h => {
                    let bestFormat = formats.find(f => f.height === h && f.acodec !== 'none' && f.ext === 'mp4');
                    if (!bestFormat) bestFormat = formats.find(f => f.height === h);

                    if (bestFormat && !idsAdded.has(h)) {
                        idsAdded.add(h);
                        options.push({
                            type: 'video',
                            quality: `${h}p`,
                            id: bestFormat.format_id,
                            hasAudio: bestFormat.acodec !== 'none',
                            ext: 'mp4',
                            filesize: bestFormat.filesize || bestFormat.filesize_approx
                        });
                    }
                });

                // Fallback
                if (options.length === 1 && formats.length > 0) {
                    options.push({ type: 'video', quality: 'Melhor Qualidade (Auto)', id: 'best', hasAudio: true, ext: 'mp4' });
                }

                userStates[chatId] = {
                    step: 'SELECTING_OPTION',
                    url: ytLink,
                    title: output.title,
                    options: options.slice(0, 8)
                };

                let menu = `🎥 *${output.title}*\n\nEscolha uma opção:\n`;
                userStates[chatId].options.forEach((opt, index) => {
                    menu += `*${index + 1}*. ${opt.quality} ${opt.filesize ? `(~${formatBytes(opt.filesize)})` : ''}\n`;
                });
                menu += `\nResponda com o número.`;

                msg.reply(menu);
                return;

            } catch (e) {
                console.error(e);
                msg.reply('❌ Erro ao ler link.');
                return;
            }
        } else {
            msg.reply('⚠️ Você precisa enviar o link junto com o comando.\nExemplo: */baixar https://youtu.be/...*');
            return;
        }
    }

    // COMANDO 2: CONVERTER MÍDIA (/converter ou @converter)
    // Antigo /amor agora é /converter, mas mantendo compatibilidade se quiser
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

    // Fluxo Youtube: Seleção
    if (userStates[chatId] && userStates[chatId].step === 'SELECTING_OPTION') {
        const choice = parseInt(text);

        if (isNaN(choice)) return; // Silêncio se não for número

        if (choice < 1 || choice > userStates[chatId].options.length) {
            msg.reply('⚠️ Opção inválida.');
            return;
        }

        const selectedOption = userStates[chatId].options[choice - 1];
        const videoTitle = (userStates[chatId].title || 'video')
            .replace(/[^\w\s\u00C0-\u00FF-]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        const videoUrl = userStates[chatId].url;

        msg.reply(`⏳ Baixando *${selectedOption.quality}*...`);
        delete userStates[chatId];

        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const baseFilename = `dl_${Date.now()}_${videoTitle}`;

        try {
            let args = [];

            if (selectedOption.type === 'audio') {
                args = [
                    videoUrl,
                    '-x',
                    '--audio-format', 'mp3',
                    '-o', path.join(tempDir, `${baseFilename}.%(ext)s`),
                    '--no-check-certificates',
                    '--ffmpeg-location', path.dirname(ffmpegPath)
                ];
            } else {
                let formatSelector = selectedOption.id;
                if (!selectedOption.hasAudio || selectedOption.id === 'best') {
                    if (selectedOption.id !== 'best') formatSelector += '+bestaudio';
                }

                args = [
                    videoUrl,
                    '-f', formatSelector,
                    '--merge-output-format', 'mp4',
                    '-o', path.join(tempDir, `${baseFilename}.%(ext)s`),
                    '--no-check-certificates',
                    '--ffmpeg-location', path.dirname(ffmpegPath)
                ];
            }

            console.log('START DOWNLOAD', args.join(' '));
            await ytDlpWrap.execPromise(args);
            console.log('END DOWNLOAD');

            const files = fs.readdirSync(tempDir);
            const downloadedFile = files.find(f => f.startsWith(baseFilename) && !f.endsWith('.part'));

            if (downloadedFile) {
                const filePath = path.join(tempDir, downloadedFile);

                // Check Size
                const stats = fs.statSync(filePath);
                const sizeMB = stats.size / (1024 * 1024);

                console.log(`Enviando ${filePath} (${sizeMB.toFixed(2)} MB)`);
                if (sizeMB > 64) msg.reply('⚠️ Arquivo grande, pode falhar.');

                const media = MessageMedia.fromFilePath(filePath);

                await client.sendMessage(chatId, media, {
                    sendMediaAsDocument: true,
                    caption: 'ta ai gatona! 😺'
                });

                setTimeout(() => { try { fs.unlinkSync(filePath); } catch (e) { } }, 10000);
            } else {
                throw new Error('Arquivo não encontrado.');
            }

        } catch (e) {
            console.error('Erro Download:', e);
            msg.reply('❌ Erro no download.');
        }
    }
});

client.initialize();
