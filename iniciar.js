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
const userStates = {};

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
    console.log('\n📋 Comandos: /baixar (link), /amor (midia), /ajuda');
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



const getYoutubeLinks = (text) => {
    const regex = /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?/g;
    return [...text.matchAll(regex)].map(m => m[0]);
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
        msg.reply('🤖 Comandos:\n1. */baixar* (ou @baixar) após enviar links\n2. */converter* (ou @converter) após enviar midias\n\nO bot olha os últimos 7 minutos de conversa.');
        return;
    }

    // Função auxiliar para buscar itens no histórico (7 minutos)
    const fetchRecentItems = async (chat, type) => {
        const history = await chat.fetchMessages({ limit: 50 }); // Busca 50 para garantir
        const limitTime = Date.now() - (7 * 60 * 1000); // 7 minutos atrás

        // Filtra mensagens recentes do usuário (ou todas se for grupo e quiser pegar de todos)
        const recentMsgs = history.filter(m => {
            const msgTime = m.timestamp * 1000;
            return msgTime > limitTime && !m.fromMe;
        });

        if (type === 'links') {
            const links = [];
            recentMsgs.forEach(m => {
                const found = getYoutubeLinks(m.body);
                links.push(...found);
            });
            return [...new Set(links)]; // Remove duplicados
        } else if (type === 'media') {
            return recentMsgs.filter(m => m.hasMedia);
        }
        return [];
    };

    // COMANDO BAIXAR (Lote com histórico de 7 min)
    if (text.toLowerCase().startsWith('/baixar') || text.toLowerCase().startsWith('@baixar')) {
        const currentLinks = getYoutubeLinks(text); // Links na própria msg do comando
        const chat = await msg.getChat();
        const historyLinks = await fetchRecentItems(chat, 'links');

        const allLinks = [...new Set([...currentLinks, ...historyLinks])];

        if (allLinks.length === 0) return msg.reply('⚠️ Nenhum link do YouTube encontrado nos últimos 7 minutos.');

        userStates[chatId] = { step: 'BATCH_DOWNLOAD', links: allLinks };
        msg.reply(`Encontrei ${allLinks.length} link(s). 📥\nEscolha:\n1. MP3 (Áudio)\n2. MP4 (Melhor Qualidade)\n3. MP4 (720p)\n4. MP4 (360p Leve)`);
        return;
    }

    // COMANDO CONVERTER (Lote com histórico de 7 min)
    if (text.toLowerCase().startsWith('/converter') || text.toLowerCase().startsWith('@converter')) {
        const chat = await msg.getChat();
        const historyMedia = await fetchRecentItems(chat, 'media');

        // Inclui a mensagem citada se existir
        let quotedMediaMsg = null;
        if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) quotedMediaMsg = quoted;
        }

        const allMediaMsgs = quotedMediaMsg ? [...historyMedia, quotedMediaMsg] : historyMedia;
        // Filtra duplicados por ID se necessário, mas msg objects são complexos, vamos confiar na lista

        const uniqueMedia = allMediaMsgs.filter((m, index, self) =>
            index === self.findIndex((t) => (t.id.id === m.id.id))
        );

        if (uniqueMedia.length === 0) return msg.reply('❌ Nenhuma mídia encontrada nos últimos 7 minutos.');

        userStates[chatId] = { step: 'BATCH_CONVERSION', msgs: uniqueMedia };
        msg.reply(`Encontrei ${uniqueMedia.length} mídia(s). 🔄\nEscolha o formato:\n1. MP3\n2. OGG\n3. WAV\n4. MP4`);
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

    // Processamento da escolha (1 a 4) para DOWNLOAD
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
            // Loop para baixar todos
            for (const link of links) {
                try {
                    const baseFilename = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                    // Monta argumentos
                    let args = [link, ...selectedOption.args, '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];

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
                    client.sendMessage(chatId, `❌ Falha ao baixar: ${link}`);
                }
            }
            client.sendMessage(chatId, '🏁 Download em lote concluído.');
        }
    }
    // Processamento da escolha para CONVERSÃO (Lote)
    if (userStates[chatId] && userStates[chatId].step === 'BATCH_CONVERSION') {
        const formats = { '1': 'mp3', '2': 'ogg', '3': 'wav', '4': 'mp4' };
        const format = formats[text];

        if (format) {
            const msgs = userStates[chatId].msgs;
            delete userStates[chatId];

            msg.reply(`⏳ Convertendo ${msgs.length} mídia(s) para ${format.toUpperCase()}...`);

            const { convertMedia } = require('./mediaHelpers');
            const tempDir = path.join(__dirname, 'temp');

            for (const mediaMsg of msgs) {
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
        }
    }
});

client.initialize();