const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// --- CORREÇÃO DE PATH PARA PKG (EXECUTÁVEL) ---
// Quando rodamos via EXE, __dirname é virtual (C:\snapshot\...) e não pode ser escrito.
// Usamos process.execPath para pegar a pasta real do executável.
const isPkg = typeof process.pkg !== 'undefined';
const rootDir = isPkg ? path.dirname(process.execPath) : __dirname;

// const googleTTS = require('google-tts-api'); // Substituído por Edge TTS
const mime = require('mime-types');

// --- IMPLEMENTAÇÃO ELEVENLABS (REALISTA) ---
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const elevenLabs = new ElevenLabsClient({ apiKey: 'sk_6dfa84b1616a8ddf625dc489cb11ae2802048db501cebacf' });

// IDs das vozes (Padrão e Secundária)
const VOICE_FEMALE = '21m00Tcm4TlvDq8ikWAM'; // Rachel (Mulher)
const VOICE_MALE = 'pNInz6obpgDQGcFmaJgB';   // Adam (Homem)
const VOICE_OLD_MALE = 'N2lVSneC4wXUNC156fE9'; // Marcus (Velho/Deep)
const VOICE_OLD_FEMALE = 't0jbNlBVZ17f02VwhZ6Z'; // Nellie (Velha)
const VOICE_KID_MALE = 'D38z5RcWu1voky8WSVqt'; // Fin (Menino)
const VOICE_KID_FEMALE = 'EXAVITQu4vr4xnSDxMaL'; // Bella (Menina)

// Função Helper local para download (HTTPS Nativo para evitar erros de Stream/Buffer)
async function downloadElevenLabsAudio(text, voiceId, outputPath) {
    return new Promise((resolve, reject) => {
        const https = require('https');

        const options = {
            method: 'POST',
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${voiceId}`,
            headers: {
                'xi-api-key': 'sk_6dfa84b1616a8ddf625dc489cb11ae2802048db501cebacf',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`ElevenLabs API Error: ${res.statusCode}`));
            }

            const fileStream = fs.createWriteStream(outputPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => resolve(outputPath));
            fileStream.on('error', reject);
        });

        req.on('error', reject);

        req.write(JSON.stringify({
            text: text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'mp3_44100_128'
        }));

        req.end();
    });
}
// ----------------------------------------------------

// --- DETECÇÃO DO SISTEMA ---
const isWindows = os.platform() === 'win32';
const isTermux = os.platform() === 'android' || (!isWindows && fs.existsSync('/data/data/com.termux/files/usr/bin/chromium'));

console.log(`\n🖥️ Sistema detectado: ${isWindows ? 'Windows (PC)' : (isTermux ? 'Android (Termux)' : 'Linux')}`);

// --- CONFIGURAÇÃO DO FFMPEG ---
let ffmpegPath;

// const isPkg = typeof process.pkg !== 'undefined'; // Já declarado no topo


try {
    if (isPkg) {
        // Se estiver rodando como EXE (pkg)
        // Precisamos extrair o binário do snapshot para o disco real
        const path = require('path');
        const fs = require('fs');

        // Caminho interno no snapshot (definido no package.json assets)
        // No pkg, 'node_modules' geralmente fica na raiz do snapshot
        const assetPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

        // Caminho destino no disco (pasta temp ou junto do exe)
        const destPath = path.join(path.dirname(process.execPath), 'ffmpeg.exe');

        // Se não existir fora, tenta copiar
        if (!fs.existsSync(destPath)) {
            try {
                fs.copyFileSync(assetPath, destPath);
                console.log('📦 Extraindo ffmpeg.exe do pacote...');
            } catch (copyErr) {
                console.warn('⚠️ Falha ao extrair FFmpeg (pode já estar em uso):', copyErr.message);
            }
        }

        ffmpegPath = destPath;
    } else {
        // Modo normal (Node.js)
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic) {
            ffmpegPath = ffmpegStatic;
        } else {
            const manualPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
            if (fs.existsSync(manualPath)) {
                ffmpegPath = manualPath;
            } else {
                ffmpegPath = 'ffmpeg';
            }
        }
    }
} catch (e) {
    console.warn('⚠️ Erro Config FFmpeg:', e.message);
    ffmpegPath = 'ffmpeg';
}

// Configura o fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
console.log(`\n🎞️ FFmpeg configurado: ${ffmpegPath}`);

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
    headless: true, // Modo silencioso (sem janela) como solicitado
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-web-security', // Permite injeção de arquivos locais mais facilmente
        '--disable-features=IsolateOrigins,site-per-process' // Ajuda em problemas de contexto
    ]
};

if (isTermux) {
    puppeteerConfig.args.push('--single-process', '--no-zygote');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// Estado em memória
const memoryFile = path.join(rootDir, 'process_memory.json');
let userStates = {};
let pendingTTS = {}; // Novo estado para /falar
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

client.on('loading_screen', (percent, message) => {
    console.log(`⌛ Carregando WhatsApp Web: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('✅ Autenticado com sucesso!');
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
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
const convertMp3ToOgg = (inputPath) => {
    return new Promise((resolve, reject) => {
        const { execFile } = require('child_process');
        const outputPath = inputPath.replace('.mp3', '.ogg');

        // Usa o ffmpegPath já resolvido globalmente
        if (!ffmpegPath || ffmpegPath === 'ffmpeg') {
            // Tenta resolver de novo se estiver genérico, ou aceita que vai falhar se não tiver no PATH
            // Mas aqui vamos confiar que a lógica de start já definiu um path melhor se possível
        }

        const args = [
            '-i', inputPath,
            '-c:a', 'libopus',
            '-b:a', '64k', // Bitrate razoável para voz
            '-vn', // No video
            '-y', // Overwrite
            outputPath
        ];

        // Se ffmpegPath for 'ffmpeg' (fallback), usamos exec (shell) ou execFile com 'ffmpeg' se tiver no path
        // Mas para garantir, vamos usar o binário direto se for caminho absoluto

        console.log(`🛠️ Convertendo com: ${ffmpegPath}`);

        execFile(ffmpegPath, args, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro FFmpeg (execFile):', stderr);
                return reject(error);
            }
            resolve(outputPath);
        });
    });
};

const systemCleanUp = () => {
    // 1. Limpa pasta temp
    const tempDir = path.join(rootDir, 'temp');
    if (fs.existsSync(tempDir)) {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) { }
    }
    fs.mkdirSync(tempDir);

    // 2. Limpa cache do WWebJS (previne erros de manifesto/versão)
    // NÃO limpamos a pasta .wwebjs_auth para manter a sessão
    const cacheDir = path.join(rootDir, '.wwebjs_cache');
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
const messageHandler = async (msg) => {
    try {
        const chatId = msg.from;
        const text = msg.body ? msg.body.trim() : '';

        if (!text && !msg.hasMedia) return;

        // --- INTERCEPTAÇÃO DE MENU DE VOZ (/falar) ---
        if (pendingTTS[chatId]) {
            const choice = parseInt(text);
            if (!isNaN(choice) && choice >= 1 && choice <= 6) {
                const voiceMap = {
                    1: VOICE_FEMALE,     // Mulher
                    2: VOICE_MALE,       // Homem
                    3: VOICE_OLD_MALE,   // Velho
                    4: VOICE_OLD_FEMALE, // Velha
                    5: VOICE_KID_MALE,   // Menino
                    6: VOICE_KID_FEMALE  // Menina
                };

                const selectedVoice = voiceMap[choice];
                const textToSpeak = pendingTTS[chatId].text;

                // Limpa estado
                delete pendingTTS[chatId];

                await msg.react('🗣️');
                try {
                    const tempMp3 = path.join(rootDir, 'temp', `tts_${Date.now()}.mp3`);

                    // 1. Baixa MP3
                    await downloadElevenLabsAudio(textToSpeak, selectedVoice, tempMp3);

                    // Valida tamanho
                    const stats = fs.statSync(tempMp3);
                    if (stats.size < 100) throw new Error("Arquivo de áudio vazio ou corrompido.");

                    // 2. Converte para OGG (PTT WhatsApp)
                    const tempOgg = await convertMp3ToOgg(tempMp3);

                    // 3. Envia OGG
                    const media = MessageMedia.fromFilePath(tempOgg);
                    await client.sendMessage(chatId, media, { sendAudioAsVoice: true });

                    // Limpeza
                    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
                    if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg);

                } catch (e) {
                    console.error('Erro TTS:', e);
                    client.sendMessage(chatId, '❌ Erro ao gerar áudio.');
                }
                return; // Impede processamento de outros comandos
            }
            // Cancela se digitar outra coisa
            delete pendingTTS[chatId];
        }

        if (text.toLowerCase() === '!cancelar') {
            delete userStates[chatId];
            msg.reply('Cancelado.');
            return;
        }

        if (['/ajuda', '!ajuda'].includes(text.toLowerCase())) {
            msg.reply('🤖 *Comandos do Bot:*\n\n1. */baixar* - Baixa vídeos/áudios (YouTube, Instagram, TikTok...)\n2. */converter* - Transforma vídeo/áudio em MP3\n3. */sticker* - Cria figurinha (mande foto/gif com legenda)\n4. */falar [texto]* - Cria áudio com voz do Google\n\n_Dica: O bot só processa o que você mandou DEPOIS do último comando._');
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

            // DEBUG: Ver o que o bot está enxergando (Removido para produção)
            // console.log(`\n🔍 Analisando ${allMediaMsgs.length} mensagens...`);

            let uniqueMedia = allMediaMsgs.filter((m, index, self) =>
                index === self.findIndex((t) => (t.id.id === m.id.id))
            );

            uniqueMedia = uniqueMedia.filter(m => {
                // Tenta pegar mime e nome de _data se principal estiver vazio
                const mime = m.mimetype || (m._data ? m._data.mimetype : '') || '';
                const filename = m.filename || (m._data ? m._data.filename : '') || '';

                const isVideo = (mime.startsWith('video/')) || m.type === 'video';
                const isAudio = (mime.startsWith('audio/')) || m.type === 'audio' || m.type === 'ptt';

                // Correção: Aceita documentos se forem video/audio por MIME ou por Extensão de arquivo
                let isDocumentMedia = m.type === 'document' && (mime.startsWith('video/') || mime.startsWith('audio/'));

                // Se não tem mime mas é documento, tenta pela extensão
                if (m.type === 'document' && !isDocumentMedia && filename) {
                    const ext = filename.split('.').pop().toLowerCase();
                    if (['mp4', 'avi', 'mov', 'mkv', 'mp3', 'ogg', 'wav'].includes(ext)) {
                        isDocumentMedia = true;
                    }
                }

                // ACEITE OTIMISTA: Se for documento e não tiver metadata, aceita para tentar baixar
                if (m.type === 'document' && !mime && !filename) {
                    console.log('[FILTER] Aceitando documento sem metadata (tentativa otimista)');
                    isDocumentMedia = true;
                }

                const aceito = isVideo || isAudio || isDocumentMedia;
                // Log removido para produção
                return aceito;
            });

            if (uniqueMedia.length === 0) return msg.reply('❌ Nenhuma mídia de áudio ou vídeo nova encontrada após o último comando.');

            msg.reply(`⚠️ Apenas formato MP3 disponível. Iniciando conversão de ${uniqueMedia.length} mídia(s)...`);

            const { convertMedia } = require('./mediaHelpers');
            const tempDir = path.join(rootDir, 'temp');

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
                const binaryPath = path.join(rootDir, binaryName);
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
                const tempDir = path.join(rootDir, 'temp');

                for (const link of links) {
                    await new Promise(r => setTimeout(r, 2000));
                    try {
                        const baseFilename = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        let args;
                        // Para YouTube, usamos o seletor complexo
                        if (link.includes('youtube.com') || link.includes('youtu.be')) {
                            args = [link, ...selectedOption.args, '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];
                        } else {
                            // Para Insta, TikTok, Facebook, usamos seletor simples (best) para evitar erro de formato
                            if (selectedOption.type === 'audio') {
                                args = [link, '-x', '--audio-format', 'mp3', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];
                            } else {
                                args = [link, '-f', 'best', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];
                            }
                        }

                        // Override específico para áudio do youtube se já nao caiu no if de cima
                        if ((link.includes('youtube.com') || link.includes('youtu.be')) && selectedOption.type === 'audio') {
                            args = [link, '-x', '--audio-format', 'mp3', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];
                        }

                        if (ffmpegPath !== 'ffmpeg') {
                            args.push('--ffmpeg-location', path.dirname(ffmpegPath));
                        }

                        await ytDlpWrap.execPromise(args);

                        const files = fs.readdirSync(tempDir);
                        const downloadedFile = files.find(f => f.startsWith(baseFilename));

                        if (downloadedFile) {
                            try {
                                const filePath = path.join(tempDir, downloadedFile);
                                const stats = fs.statSync(filePath);
                                const fileSizeInBytes = stats.size;
                                const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

                                console.log(`📊 Tamanho: ${fileSizeInMegabytes.toFixed(2)} MB`);

                                // Construção manual da mídia
                                const fileData = fs.readFileSync(filePath, { encoding: 'base64' });
                                const mimetype = mime.lookup(filePath) || 'application/octet-stream';
                                const media = new MessageMedia(mimetype, fileData, downloadedFile);

                                try {
                                    // Tenta enviar como mídia normal
                                    await client.sendMessage(chatId, media, { caption: '✅ Aqui está!' });
                                } catch (sendError) {
                                    console.error(`⚠️ Erro envio padrão (${sendError.message}). Tentando como documento...`);
                                    // Fallback: Envia como documento
                                    await client.sendMessage(chatId, media, { caption: '✅ Aqui está (Arquivo)!', sendMediaAsDocument: true });
                                }

                                fs.unlinkSync(filePath);
                            } catch (error) {
                                console.error('Erro geral processamento:', error);
                                client.sendMessage(chatId, '❌ Erro ao processar arquivo.');
                            }
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

        // COMANDO FALAR (INTERATIVO)
        if (text.toLowerCase().startsWith('/falar') || text.toLowerCase().startsWith('@falar')) {
            const content = text.replace(/[\/|@]falar/i, '').trim();
            if (!content) return msg.reply('❌ Digite o texto. Ex: */falar Olá mundo*');

            // Salva estado e exibe menu
            pendingTTS[chatId] = { text: content, timestamp: Date.now() };

            const menu = `🗣️ *Escolha a voz:*\n\n` +
                `1. 👩 Mulher (Rachel) - Padrão\n` +
                `2. 👨 Homem (Adam)\n` +
                `3. 👴 Velho (Marcus)\n` +
                `4. 👵 Velha (Nellie)\n` +
                `5. 👦 Menino (Fin)\n` +
                `6. 👧 Menina (Bella)\n\n` +
                `_Responda com o número (1-6)._`;

            await client.sendMessage(chatId, menu);
        }

    } catch (e) {
        console.error('Erro fatal na mensagem:', e);
    }
};

client.on('message', messageHandler);

if (require.main === module) {
    client.initialize();
} else {
    module.exports = {
        fetchRecentItems,
        saveMemory,
        userLastProcessTime,
        extractLinks,
        isWindows,
        isTermux,
        messageHandler,
        client,
        ytDlpWrap
    };
}