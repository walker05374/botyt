const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const googleTTS = require('google-tts-api'); // Módulo de voz adicionado

// --- DETECÇÃO DO SISTEMA ---
const isWindows = os.platform() === 'win32';
const isTermux = os.platform() === 'android' || (!isWindows && fs.existsSync('/data/data/com.termux/files/usr/bin/chromium'));

console.log(`\n🖥️ Sistema detectado: ${isWindows ? 'Windows (PC)' : (isTermux ? 'Android (Termux)' : 'Linux')}`);

// --- CONFIGURAÇÃO DO FFMPEG ---
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    ffmpegPath = 'ffmpeg';
}
ffmpeg.setFfmpegPath(ffmpegPath);

// --- BUSCA AUTOMÁTICA DO NAVEGADOR (CHROME) ---
let chromePath;

const which = (cmd) => {
    try {
        const { execSync } = require('child_process');
        return execSync(`which ${cmd} 2>/dev/null`).toString().trim();
    } catch (e) {
        return null;
    }
};

if (isTermux) {
    chromePath = which('chromium') || which('chromium-browser');
    if (!chromePath) {
        const commonPaths = [
            '/data/data/com.termux/files/usr/bin/chromium',
            '/data/data/com.termux/files/usr/bin/chromium-browser'
        ];
        chromePath = commonPaths.find(p => fs.existsSync(p));
    }

    if (!chromePath) {
        console.error('\n❌ ERRO CRÍTICO: Chromium não encontrado no Termux!');
        console.error('👉 Execute: pkg install chromium');
        process.exit(1);
    }
    console.log(`✅ Navegador encontrado: ${chromePath}`);

} else if (isWindows) {
    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    chromePath = possiblePaths.find(p => fs.existsSync(p));
}

if (isWindows && !chromePath) {
    console.error('❌ ERRO: Não encontrei o Google Chrome ou Edge no seu Windows!');
    process.exit(1);
}

// --- CONFIGURAÇÃO DO CLIENTE WHATSAPP ---
const puppeteerConfig = {
    executablePath: chromePath,
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run'
    ]
};

if (isTermux) {
    puppeteerConfig.args.push('--single-process', '--no-zygote');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig,
    // Fix para erro LocalWebCache manifest
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// Estado em memória
const memoryFile = path.join(__dirname, 'process_memory.json');
let userStates = {};
let userLastProcessTime = {};

if (fs.existsSync(memoryFile)) {
    try {
        userLastProcessTime = JSON.parse(fs.readFileSync(memoryFile));
        console.log('🧠 Memória de processamento carregada.');
    } catch (e) {
        console.error('⚠️ Falha ao ler memória:', e);
    }
}

const saveMemory = () => {
    try {
        fs.writeFileSync(memoryFile, JSON.stringify(userLastProcessTime, null, 2));
    } catch (e) {
        console.error('⚠️ Falha ao salvar memória:', e);
    }
};

// --- GERAÇÃO DO QR CODE ---
client.on('qr', (qr) => {
    console.log('\n⌛ Gerando QR Code no terminal...\n');
    qrcode.toString(qr, { type: 'terminal', small: true }, function (err, url) {
        if (err) console.error(err);
        console.log(url);
    });

    qrcode.toFile('./qr.png', qr, {
        color: { dark: '#000000', light: '#FFFFFF' }
    }, function (err) {
        if (!err) console.log('\n✅ QR Code também salvo como imagem: qr.png');
    });
});

client.on('ready', () => {
    console.log('\n==================================================');
    console.log('🤖 BOT ONLINE E PRONTO PARA USO!');
    console.log('==================================================');
    console.log('\n📋 Comandos Disp.:');
    console.log('1. /baixar [link] (YouTube, Insta, TikTok...)');
    console.log('2. /converter (responda midia)');
    console.log('3. /sticker (responda imagem)');
    console.log('4. /falar [texto]');
});

// --- FUNÇÕES UTILITÁRIAS ---
const cleanTempFolder = () => {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    else {
        // --- FUNÇÕES UTILITÁRIAS ---
        const systemCleanUp = () => {
            // 1. Limpa pasta temp
            const tempDir = path.join(__dirname, 'temp');
            if (fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) { }
            }
            fs.mkdirSync(tempDir);

            // 2. Limpa cache do WWebJS (previne erros de manifesto/versão)
            // NÃO limpamos a pasta .wwebjs_auth para manter a sessão
            const cacheDir = path.join(__dirname, '.wwebjs_cache');
            if (fs.existsSync(cacheDir)) {
                try {
                    fs.rmSync(cacheDir, { recursive: true, force: true });
                    console.log('🧹 Cache do sistema (.wwebjs_cache) limpo.');
                } catch (e) {
                    console.log('⚠️ Aviso: Cache em uso ou bloqueado (normal se recém fechado).');
                }
            }
            console.log('🧹 Sistema limpo e pronto.');
        };
        systemCleanUp();

        // Função corrigida para extrair links
        const extractLinks = (text) => {
            if (!text) return [];
            const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
            const allLinks = [...text.matchAll(regex)].map(m => m[0]);
            const allowedDomains = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'facebook.com', 'fb.watch', 'twitter.com', 'x.com'];
            return allLinks.filter(link => allowedDomains.some(domain => link.includes(domain)));
        };

        const fetchRecentItems = async (chat, type, minTimestamp, maxTimestamp) => {
            try {
                const history = await chat.fetchMessages({ limit: 50 });
                const start = minTimestamp || 0;
                const end = maxTimestamp || Date.now();

                const recentMsgs = history.filter(m => {
                    const msgTime = m.timestamp * 1000;
                    return msgTime > start && msgTime <= end && !m.fromMe;
                });

                if (type === 'links') {
                    const links = [];
                    recentMsgs.forEach(m => {
                        const found = extractLinks(m.body);
                        links.push(...found);
                    });
                    return [...new Set(links)];
                } else if (type === 'media') {
                    return recentMsgs.filter(m => m.hasMedia);
                }
            } catch (e) {
                console.error('Erro ao buscar histórico:', e);
            }
            return [];
        };

        // --- MENSAGENS E COMANDOS ---
        client.on('message', async msg => {
            try {
                const chatId = msg.from;
                const text = msg.body ? msg.body.trim() : '';

                if (!text && !msg.hasMedia) return;

                if (text.toLowerCase() === '!cancelar') {
                    delete userStates[chatId];
                    msg.reply('Cancelado.');
                    return;
                }

                if (['/ajuda', '!ajuda'].includes(text.toLowerCase())) {
                    msg.reply('🤖 *Comandos do Bot:*\n\n1. */baixar* - Baixa vídeos/áudios (YouTube, Instagram, TikTok...)\n2. */converter* - Transforma vídeo/áudio em MP3\n3. */sticker* - Cria figurinha (mande foto/gif com legenda)\n4. */falar [frase]* - Cria áudio com voz do Google\n\n_Dica: O bot só processa o que você mandou DEPOIS do último comando._');
                    return;
                }

                // COMANDO BAIXAR
                if (text.toLowerCase().startsWith('/baixar') || text.toLowerCase().startsWith('@baixar')) {
                    await msg.react('🔎');
                    const currentLinks = extractLinks(text);
                    const chat = await msg.getChat();

                    const lastTime = userLastProcessTime[chatId] || 0;
                    const commandTime = msg.timestamp * 1000; // Corrigido aqui (sem erro de digitação)

                    const historyLinks = await fetchRecentItems(chat, 'links', lastTime, commandTime);

                    userLastProcessTime[chatId] = commandTime;
                    saveMemory();

                    const allLinks = [...new Set([...currentLinks, ...historyLinks])];

                    if (allLinks.length === 0) return msg.reply('⚠️ Nenhum item novo encontrado após o último comando.');

                    userStates[chatId] = { step: 'BATCH_DOWNLOAD', links: allLinks };
                    msg.reply(`Encontrei ${allLinks.length} link(s). 📥\nEscolha:\n1. MP3 (Áudio)\n2. MP4 (Melhor Qualidade)\n3. MP4 (720p)\n4. MP4 (360p)`);
                    return;
                }

                // COMANDO CONVERTER
                if (text.toLowerCase().startsWith('/converter') || text.toLowerCase().startsWith('@converter')) {
                    await msg.react('🔎');
                    const chat = await msg.getChat();
                    const lastTime = userLastProcessTime[chatId] || 0;

                    const commandTime = msg.timestamp * 1000;

                    const historyMedia = await fetchRecentItems(chat, 'media', lastTime, commandTime);
                    userLastProcessTime[chatId] = commandTime;
                    saveMemory();

                    let quotedMediaMsg = null;
                    if (msg.hasQuotedMsg) {
                        const quoted = await msg.getQuotedMessage();
                        if (quoted.hasMedia) quotedMediaMsg = quoted;
                    }

                    const allMediaMsgs = quotedMediaMsg ? [...historyMedia, quotedMediaMsg] : historyMedia;
                    let uniqueMedia = allMediaMsgs.filter((m, index, self) =>
                        index === self.findIndex((t) => (t.id.id === m.id.id))
                    );

                    uniqueMedia = uniqueMedia.filter(m => {
                        const isVideo = (m.mimetype && m.mimetype.startsWith('video/')) || m.type === 'video';
                        const isAudio = (m.mimetype && m.mimetype.startsWith('audio/')) || m.type === 'audio' || m.type === 'ptt';
                        return isVideo || isAudio;
                    });

                    if (uniqueMedia.length === 0) return msg.reply('❌ Nenhuma mídia de áudio ou vídeo nova encontrada após o último comando.');

                    msg.reply(`⚠️ Apenas formato MP3 disponível. Iniciando conversão de ${uniqueMedia.length} mídia(s)...`);

                    const { convertMedia } = require('./mediaHelpers');
                    const tempDir = path.join(__dirname, 'temp');

                    for (const mediaMsg of uniqueMedia) {
                        await new Promise(r => setTimeout(r, 2000));
                        try {
                            const media = await mediaMsg.downloadMedia();
                            if (!media) continue;

                            const inputFilename = `conv_${Date.now()}_${Math.floor(Math.random() * 1000)}.${media.mimetype.split('/')[1].split(';')[0]}`;
                            const inputPath = path.join(tempDir, inputFilename);

                            fs.writeFileSync(inputPath, media.data, 'base64');

                            const outputPath = await convertMedia(inputPath, 'mp3', ffmpegPath);

                            const convertedMedia = MessageMedia.fromFilePath(outputPath);
                            await client.sendMessage(chatId, convertedMedia, { caption: '✅ Convertido!' });

                            fs.unlinkSync(inputPath);
                            fs.unlinkSync(outputPath);
                        } catch (e) {
                            console.error(e);
                            client.sendMessage(chatId, '❌ Falha ao converter uma das mídias.');
                        }
                    }
                    client.sendMessage(chatId, '🏁 Conversão em lote concluída.');
                    return;
                }

                // VERIFICAR YT-DLP
                (async () => {
                    const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
                    if (isTermux && fs.existsSync('/data/data/com.termux/files/usr/bin/yt-dlp')) {
                        ytDlpWrap.setBinaryPath('/data/data/com.termux/files/usr/bin/yt-dlp');
                    } else {
                        const binaryPath = path.join(__dirname, binaryName);
                        ytDlpWrap.setBinaryPath(binaryPath);
                        if (!fs.existsSync(binaryPath)) {
                            try {
                                await YTDlpWrap.downloadFromGithub(binaryPath);
                                if (!isWindows) fs.chmodSync(binaryPath, '755');
                            } catch (e) { console.error('Erro baixando yt-dlp:', e); }
                        }
                    }
                })();

                // PROCESSAMENTO DE DOWNLOAD
                if (userStates[chatId] && userStates[chatId].step === 'BATCH_DOWNLOAD') {
                    const choice = text.trim();
                    const options = {
                        '1': { type: 'audio', args: ['-x', '--audio-format', 'mp3'] },
                        '2': { type: 'video', args: ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'] },
                        '3': { type: 'video', args: ['-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]'] },
                        '4': { type: 'video', args: ['-f', 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]'] }
                    };

                    if (options[choice]) {
                        const links = userStates[chatId].links;
                        const selectedOption = options[choice];
                        delete userStates[chatId];

                        msg.reply(`⏳ Iniciando download de ${links.length} arquivo(s)...`);
                        const tempDir = path.join(__dirname, 'temp');

                        for (const link of links) {
                            await new Promise(r => setTimeout(r, 2000));
                            try {
                                const baseFilename = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                                let args = [link, ...selectedOption.args, '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];

                                if (!link.includes('youtube.com') && !link.includes('youtu.be') && selectedOption.type === 'audio') {
                                    args = [link, '-x', '--audio-format', 'mp3', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];
                                }
                                if (ffmpegPath !== 'ffmpeg') {
                                    args.push('--ffmpeg-location', path.dirname(ffmpegPath));
                                }

                                await ytDlpWrap.execPromise(args);

                                const files = fs.readdirSync(tempDir);
                                const downloadedFile = files.find(f => f.startsWith(baseFilename));

                                if (downloadedFile) {
                                    const media = MessageMedia.fromFilePath(path.join(tempDir, downloadedFile));
                                    await client.sendMessage(chatId, media, { caption: '✅ Aqui está!' });
                                    fs.unlinkSync(path.join(tempDir, downloadedFile));
                                } else {
                                    throw new Error('Arquivo não encontrado após download');
                                }
                            } catch (e) {
                                console.error('Erro no download:', e);
                                client.sendMessage(chatId, `❌ Falha ao baixar: ${link}\n(Talvez seja privado ou erro do yt-dlp)`);
                            }
                        }
                        client.sendMessage(chatId, '🏁 Download em lote concluído.');
                    }
                }

                // COMANDO STICKER
                if (text.toLowerCase() === '/sticker' || text.toLowerCase() === '@sticker') {
                    let mediaMsg = msg.hasMedia ? msg : null;
                    if (!mediaMsg && msg.hasQuotedMsg) {
                        const quoted = await msg.getQuotedMessage();
                        if (quoted.hasMedia) mediaMsg = quoted;
                    }

                    if (mediaMsg) {
                        try {
                            const media = await mediaMsg.downloadMedia();
                            await client.sendMessage(chatId, media, { sendMediaAsSticker: true });
                        } catch (e) {
                            console.error(e);
                            msg.reply('❌ Erro ao criar figurinha.');
                        }
                    } else {
                        msg.reply('❌ Envie uma imagem com a legenda /sticker ou responda a uma imagem com /sticker.');
                    }
                }

                // COMANDO FALAR
                if (text.toLowerCase().startsWith('/falar')) {
                    const frase = text.replace(/\/falar/i, '').trim();
                    if (!frase) return msg.reply('❌ Diga o que eu devo falar. Ex: /falar Oi');

                    try {
                        const url = googleTTS.getAudioUrl(frase, {
                            lang: 'pt-BR',
                            slow: false,
                            host: 'https://translate.google.com',
                        });

                        const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
                        await client.sendMessage(chatId, media, { sendAudioAsVoice: true });
                    } catch (e) {
                        console.error('Erro no TTS:', e);
                        msg.reply('❌ Erro ao gerar áudio.');
                    }
                }

            } catch (e) {
                console.error('Erro fatal na mensagem:', e);
            }
        });

        if (require.main === module) {
            client.initialize();
        } else {
            module.exports = { fetchRecentItems, saveMemory, userLastProcessTime, extractLinks, isWindows, isTermux };
        }