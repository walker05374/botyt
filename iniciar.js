const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// --- DETECÇÃO DO SISTEMA ---
// Verifica se é Windows ou Termux para ajustar configurações
const isWindows = os.platform() === 'win32';
// Detecção mais robusta para Termux (Android)
const isTermux = os.platform() === 'android' || (!isWindows && fs.existsSync('/data/data/com.termux/files/usr/bin/chromium'));

console.log(`\n🖥️ Sistema detectado: ${isWindows ? 'Windows (PC)' : (isTermux ? 'Android (Termux)' : 'Linux')}`);

// --- CONFIGURAÇÃO DO FFMPEG ---
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    // No Termux ou se o ffmpeg-static falhar, tenta usar o do sistema
    ffmpegPath = 'ffmpeg';
}
ffmpeg.setFfmpegPath(ffmpegPath);

// --- BUSCA AUTOMÁTICA DO NAVEGADOR (CHROME) ---
let chromePath;

// Função para achar comandos no sistema
const which = (cmd) => {
    try {
        const { execSync } = require('child_process');
        return execSync(`which ${cmd} 2>/dev/null`).toString().trim();
    } catch (e) {
        return null;
    }
};

if (isTermux) {
    // Tenta achar 'chromium' ou 'chromium-browser' no PATH
    chromePath = which('chromium') || which('chromium-browser');

    if (!chromePath) {
        // Fallback para caminhos comuns se o 'which' falhar
        const commonPaths = [
            '/data/data/com.termux/files/usr/bin/chromium',
            '/data/data/com.termux/files/usr/bin/chromium-browser'
        ];
        chromePath = commonPaths.find(p => fs.existsSync(p));
    }

    if (!chromePath) {
        console.error('\n❌ ERRO CRÍTICO: Chromium não encontrado no Termux!');
        console.error('👉 Para corrigir, execute este comando no Termux:');
        console.error('   pkg install chromium');
        console.error('Depois tente rodar o bot novamente.\n');
        process.exit(1);
    }
    console.log(`✅ Navegador encontrado: ${chromePath}`);

} else if (isWindows) {
    // Tenta achar o Chrome ou Edge no Windows automaticamente
    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    chromePath = possiblePaths.find(p => fs.existsSync(p));
}

// Se não achar navegador no Windows, avisa
if (isWindows && !chromePath) {
    console.error('❌ ERRO: Não encontrei o Google Chrome ou Edge no seu Windows!');
    console.error('Instale o Chrome ou configure o caminho manualmente no código.');
    process.exit(1);
}

// --- CONFIGURAÇÃO DO CLIENTE WHATSAPP ---
const puppeteerConfig = {
    executablePath: chromePath, // Usa o caminho detectado acima
    headless: true, // true = sem janela (fundo), false = abre o navegador
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run'
    ]
};

// Configurações extras obrigatórias apenas para o Termux
if (isTermux) {
    puppeteerConfig.args.push('--single-process', '--no-zygote');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// Estado em memória
// Estado em memória (com persistência)
const memoryFile = path.join(__dirname, 'process_memory.json');
let userStates = {};
let userLastProcessTime = {};

// Carrega memória ao iniciar
if (fs.existsSync(memoryFile)) {
    try {
        userLastProcessTime = JSON.parse(fs.readFileSync(memoryFile));
        console.log('🧠 Memória de processamento carregada.');
    } catch (e) {
        console.error('⚠️ Falha ao ler memória:', e);
    }
}

// Função para salvar memória
const saveMemory = () => {
    try {
        fs.writeFileSync(memoryFile, JSON.stringify(userLastProcessTime, null, 2));
        console.log('💾 Memória salva.');
    } catch (e) {
        console.error('⚠️ Falha ao salvar memória:', e);
    }
};

// --- GERAÇÃO DO QR CODE ---
client.on('qr', (qr) => {
    // Exibe o QR Code no terminal (Opção mais fácil)
    console.log('\n⌛ Gerando QR Code no terminal...\n');
    qrcode.toString(qr, { type: 'terminal', small: true }, function (err, url) {
        if (err) console.error(err);
        console.log(url); // Imprime o QR Art
    });

    // Salva arquivo qr.png (Backup)
    qrcode.toFile('./qr.png', qr, {
        color: { dark: '#000000', light: '#FFFFFF' }
    }, function (err) {
        if (err) throw err;
        console.log('\n✅ QR Code também salvo como imagem: qr.png');
        if (isWindows) {
            console.log('💡 Dica: Abra imagem qr.png se o terminal ficar ruim.');
        } else {
            console.log('💡 Dica: Use "termux-open qr.png" se preferir a imagem.');
        }
    });
});

client.on('ready', () => {
    console.log('\n==================================================');
    console.log('🤖 BOT ONLINE E PRONTO PARA USO!');
    console.log('==================================================');
    console.log('\n📋 Comandos: /baixar (link), /converter (midia)');
});

// --- FUNÇÕES UTILITÁRIAS ---
const cleanTempFolder = () => {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    else {
        fs.readdirSync(tempDir).forEach(file => {
            try { fs.unlinkSync(path.join(tempDir, file)); } catch (e) { }
        });
        console.log('🧹 Pasta temp limpa.');
    }
};
cleanTempFolder();



// Função para extrair links de várias plataformas (YouTube, Instagram, TikTok, Facebook, Twitter)
const extractLinks = (text) => {
    if (!text) return [];
    // Regex mais ampla para capturar URLs http/https
    const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const allLinks = [...text.matchAll(regex)].map(m => m[0]);

    // Filtra apenas domínios de interesse para evitar lixo
    const allowedDomains = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'facebook.com', 'fb.watch', 'twitter.com', 'x.com'];
    return allLinks.filter(link => allowedDomains.some(domain => link.includes(domain)));
};


// --- FUNÇÕES DE LÓGICA (Extraídas para Global para Testes) ---

// Função auxiliar para buscar itens no histórico (Janela estrita: > minTimestamp e <= maxTimestamp)
const fetchRecentItems = async (chat, type, minTimestamp, maxTimestamp) => {
    const history = await chat.fetchMessages({ limit: 50 });

    // Se não tiver minTimestamp, assume muito antigo (0)
    // Se não tiver maxTimestamp, assume agora
    const start = minTimestamp || 0;
    const end = maxTimestamp || Date.now();

    console.log(`\n🔍 FetchRecentItems:`);
    console.log(`   - Start (LastTime): ${start}`);
    console.log(`   - End (CommandTime): ${end}`);

    // Filtra mensagens estritamente dentro da janela
    const recentMsgs = history.filter(m => {
        const msgTime = m.timestamp * 1000;
        const inWindow = msgTime > start && msgTime <= end && !m.fromMe;
        return inWindow;
    });

    if (type === 'links') {
        const links = [];
        recentMsgs.forEach(m => {
            const found = extractLinks(m.body);
            links.push(...found);
        });
        return [...new Set(links)]; // Remove duplicados
    } else if (type === 'media') {
        return recentMsgs.filter(m => m.hasMedia);
    }
    return [];
};


// --- MENSAGENS E COMANDOS ---
client.on('message', async msg => {
    const chatId = msg.from;
    const text = msg.body.trim();

    // Tratamento para não processar status ou mensagens vazias
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

    // COMANDO BAIXAR / INSTAGRAM / TIKTOK (Lote com histórico)
    if (text.toLowerCase().startsWith('/baixar') || text.toLowerCase().startsWith('@baixar')) {
        await msg.react('🔎'); // Feedback instantâneo
        const currentLinks = extractLinks(text); // Links na própria msg do comando
        const chat = await msg.getChat();

        // Janela de Tempo: Do último comando até AGORA (horário desta mensagem de comando)
        const lastTime = userLastProcessTime[chatId] || 0;
        const commandTime = msg.timestamp * 1000;

        const historyLinks = await fetchRecentItems(chat, 'links', lastTime, commandTime);

        // ATUALIZA O TEMPO PARA O HORÁRIO DESTE COMANDO E SALVA
        userLastProcessTime[chatId] = commandTime;
        saveMemory();

        // Se tiver links na própria mensagem, inclui eles também
        const allLinks = [...new Set([...currentLinks, ...historyLinks])];

        if (allLinks.length === 0) return msg.reply('⚠️ Nenhum item novo encontrado após o último comando.');

        userStates[chatId] = { step: 'BATCH_DOWNLOAD', links: allLinks };
        msg.reply(`Encontrei ${allLinks.length} link(s). 📥\nEscolha:\n1. MP3 (Áudio)\n2. MP4 (Melhor Qualidade)\n3. MP4 (720p)\n4. MP4 (360p Leve)`);
        return;
    }

    // COMANDO CONVERTER (Lote com histórico de 7 min)
    if (text.toLowerCase().startsWith('/converter') || text.toLowerCase().startsWith('@converter')) {
        await msg.react('🔎'); // Feedback instantâneo
        const chat = await msg.getChat();

        // Janela de Tempo: Do último comando até AGORA
        const lastTime = userLastProcessTime[chatId] || 0;
        const commandTime = msg.timestamp * 1000;

        console.log(`\n🤖 Comando /converter de: ${chatId}`);
        console.log(`   - LastTime em memória: ${lastTime}`);
        console.log(`   - CommandTime atual: ${commandTime}`);

        const historyMedia = await fetchRecentItems(chat, 'media', lastTime, commandTime);

        // ATUALIZA O TEMPO PARA O HORÁRIO DESTE COMANDO E SALVA
        userLastProcessTime[chatId] = commandTime; // Importante: Atualiza ANTES de processar para garantir a janela
        saveMemory();

        // Inclui a mensagem citada apenas se ela for NOVA (dentro da janela) ou explicitamente citada
        // Se for explicitamente citada, ignoramos a janela para ela
        let quotedMediaMsg = null;
        if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) quotedMediaMsg = quoted;
        }

        const allMediaMsgs = quotedMediaMsg ? [...historyMedia, quotedMediaMsg] : historyMedia;
        // Filtra duplicados por ID
        let uniqueMedia = allMediaMsgs.filter((m, index, self) =>
            index === self.findIndex((t) => (t.id.id === m.id.id))
        );

        // DEBUG: Mostra o que o bot está vendo
        console.log(`\n🔍 Analisando ${uniqueMedia.length} mensagens candidatas:`);
        uniqueMedia.forEach(m => {
            console.log(`- ID: ${m.id._serialized} | Tipo: ${m.type} | Mime: ${m.mimetype} | Tempo: ${m.timestamp}`);
        });

        // FILTRO DE SEGURANÇA MAIS ROBUSTO
        // Aceita se tiver mimetype correto OU se o 'type' do whats for video/audio/ptt
        uniqueMedia = uniqueMedia.filter(m => {
            const isVideo = (m.mimetype && m.mimetype.startsWith('video/')) || m.type === 'video';
            const isAudio = (m.mimetype && m.mimetype.startsWith('audio/')) || m.type === 'audio' || m.type === 'ptt' || m.type === 'voice';
            return isVideo || isAudio;
        });

        console.log(`👉 Após filtro: ${uniqueMedia.length} mídias válidas.`);

        if (uniqueMedia.length === 0) return msg.reply('❌ Nenhuma mídia de áudio ou vídeo nova encontrada após o último comando.');

        // AUTOMAÇÃO: Como só tem MP3, inicia direto sem perguntar
        const format = 'mp3';
        msg.reply(`⚠️ Apenas formato MP3 disponível. Iniciando conversão de ${uniqueMedia.length} mídia(s)...`);

        const { convertMedia } = require('./mediaHelpers');
        const tempDir = path.join(__dirname, 'temp');

        for (const mediaMsg of uniqueMedia) {
            await new Promise(r => setTimeout(r, 2000)); // Delay para evitar bloqueio
            try {
                const media = await mediaMsg.downloadMedia();
                if (!media) continue;

                const inputFilename = `conv_${Date.now()}_${Math.floor(Math.random() * 1000)}.${media.mimetype.split('/')[1].split(';')[0]}`;
                const inputPath = path.join(tempDir, inputFilename);

                fs.writeFileSync(inputPath, media.data, 'base64');

                const outputPath = await convertMedia(inputPath, format, ffmpegPath);

                const convertedMedia = MessageMedia.fromFilePath(outputPath);
                await client.sendMessage(chatId, convertedMedia, { caption: '✅ Convertido!' });

                // Limpeza
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

    // Verificar binário yt-dlp (Compatível Win/Android)
    (async () => {
        const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';

        // No Termux, prioriza o do sistema
        if (isTermux && fs.existsSync('/data/data/com.termux/files/usr/bin/yt-dlp')) {
            ytDlpWrap.setBinaryPath('/data/data/com.termux/files/usr/bin/yt-dlp');
            console.log('✅ Usando yt-dlp do sistema Termux.');
        } else {
            const binaryPath = path.join(__dirname, binaryName);
            ytDlpWrap.setBinaryPath(binaryPath);

            if (!fs.existsSync(binaryPath)) {
                console.log('⚠️ Baixando binário yt-dlp...');
                try {
                    await YTDlpWrap.downloadFromGithub(binaryPath);
                    if (!isWindows) fs.chmodSync(binaryPath, '755');
                    console.log('✅ yt-dlp baixado!');
                } catch (e) {
                    console.error('❌ Erro ao baixar yt-dlp:', e);
                }
            } else {
                console.log('✅ yt-dlp local encontrado.');
            }
        }
    })();

    // PROCESSAMENTO /BAIXAR - Agora suporta audio apenas para YouTube
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

                    // Ajuste para redes sociais (Insta/TikTok/etc não aceitam bem argumentos complexos de audio as vezes, mas yt-dlp lida bem)
                    if (!link.includes('youtube.com') && !link.includes('youtu.be') && selectedOption.type === 'audio') {
                        // Para TikTok/Insta, yt-dlp as vezes baixa mp4. Forçamos extração.
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
                    }
                } catch (e) {
                    console.error(e);
                    client.sendMessage(chatId, `❌ Falha ao baixar: ${link}\n(Talvez seja privado ou erro do yt-dlp)`);
                }
            }
            client.sendMessage(chatId, '🏁 Download em lote concluído.');
        }
    }

    // --- NOVA FUNCIONALIDADE: FIGURINHA (/sticker) ---
    if (text.toLowerCase() === '/sticker' || text.toLowerCase() === '@sticker') {
        let mediaMsg = msg.hasMedia ? msg : null;
        if (!mediaMsg && msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) mediaMsg = quoted;
        }

        if (mediaMsg) {
            try {
                const media = await mediaMsg.downloadMedia();
                client.sendMessage(chatId, media, { sendMediaAsSticker: true });
            } catch (e) {
                msg.reply('❌ Erro ao criar figurinha.');
                console.error(e);
            }
        } else {
            msg.reply('❌ Envie uma imagem com a legenda /sticker ou responda a uma imagem com /sticker.');
        }
    }

    // --- NOVA FUNCIONALIDADE: TEXTO PARA VOZ (/falar) ---
    if (text.toLowerCase().startsWith('/falar')) {
        const frase = text.replace(/\/falar/i, '').trim();
        if (!frase) return msg.reply('❌ Diga o que eu devo falar. Ex: /falar Oi');

        const googleTTS = require('google-tts-api');
        try {
            const url = googleTTS.getAudioUrl(frase, {
                lang: 'pt-BR',
                slow: false,
                host: 'https://translate.google.com',
            });

            // O whatsapp-web.js aceita URL direto no MessageMedia.fromUrl
            const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
            client.sendMessage(chatId, media, { sendAudioAsVoice: true }); // Manda como PTT (bolinha azul)
        } catch (e) {
            console.error(e);
            msg.reply('❌ Erro ao gerar áudio.');
        }
    }

});

// Inicialização Condicional
if (require.main === module) {
    client.initialize();
} else {
    // Exporta para testes
    module.exports = {
        fetchRecentItems,
        saveMemory,
        userLastProcessTime,
        extractLinks, // Atualizado
        isWindows,
        isTermux
    };
}