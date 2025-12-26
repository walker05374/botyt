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
if (isTermux) {
    // No Termux, o Chromium é OBRIGATÓRIO
    const termuxChromiumPath = '/data/data/com.termux/files/usr/bin/chromium';
    if (fs.existsSync(termuxChromiumPath)) {
        chromePath = termuxChromiumPath;
    } else {
        console.error('\n❌ ERRO CRÍTICO: Chromium não encontrado no Termux!');
        console.error('👉 Para corrigir, execute este comando no Termux:');
        console.error('   pkg install chromium');
        console.error('Depois tente rodar o bot novamente.\n');
        process.exit(1);
    }
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
    qrcode.toFile('./qr.png', qr, {
        color: { dark: '#000000', light: '#FFFFFF' }
    }, function (err) {
        if (err) throw err;
        console.log('\n✅ QR Code gerado!');
        console.log('📂 Arquivo: qr.png');
        if (isWindows) {
            console.log('💡 Dica: Abra a imagem qr.png na pasta para escanear.');
        } else {
            console.log('💡 Dica: No Termux, copie a imagem ou use o termux-open.');
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

const isYoutubeLink = (text) => {
    const match = text.match(/((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?/);
    return match ? match[0] : null;
};

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

// --- MENSAGENS E COMANDOS ---
client.on('message', async msg => {
    const chatId = msg.from;
    const text = msg.body.trim();

    if (text.toLowerCase() === '!cancelar') {
        delete userStates[chatId];
        msg.reply('Cancelado.');
        return;
    }

    if (['/ajuda', '!ajuda'].includes(text.toLowerCase())) {
        msg.reply('🤖 Comandos:\n1. */baixar* [link youtube]\n2. Responda midia com */converter*');
        return;
    }

    // COMANDO BAIXAR
    if (text.toLowerCase().startsWith('/baixar') || text.toLowerCase().startsWith('@baixar')) {
        const link = isYoutubeLink(text);
        if (!link) return msg.reply('⚠️ Link não encontrado.');

        userStates[chatId] = { step: 'BATCH_DOWNLOAD', links: [link] };
        msg.reply('Escolha:\n1. MP3 (Áudio)\n2. MP4 (Vídeo)');
        return;
    }

    // COMANDO CONVERTER (/amor mantido por compatibilidade)
    if (['/converter', '/amor'].includes(text.toLowerCase().split(' ')[0])) {
        if (!msg.hasQuotedMsg) return msg.reply('❌ Responda a uma mídia.');
        const quoted = await msg.getQuotedMessage();
        if (!quoted.hasMedia) return msg.reply('❌ A mensagem respondida não tem mídia.');

        userStates[chatId] = { step: 'BATCH_CONVERSION', msgs: [quoted] };
        msg.reply('Escolha:\n1. MP3\n2. OGG\n3. WAV\n4. MP4');
        return;
    }

    // Processamento da escolha (1 ou 2)
    if (userStates[chatId] && userStates[chatId].step === 'BATCH_DOWNLOAD') {
        if (text === '1' || text === '2') {
            const link = userStates[chatId].links[0];
            const type = text === '1' ? 'audio' : 'video';
            delete userStates[chatId];
            msg.reply(`⏳ Baixando...`);

            try {
                const tempDir = path.join(__dirname, 'temp');
                const baseFilename = `dl_${Date.now()}`;

                // Lógica simples de argumentos para exemplo
                let args = type === 'audio'
                    ? [link, '-x', '--audio-format', 'mp3', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)]
                    : [link, '-f', 'mp4', '-o', path.join(tempDir, `${baseFilename}.%(ext)s`)];

                // Adiciona local do ffmpeg se necessário
                if (ffmpegPath !== 'ffmpeg') {
                    args.push('--ffmpeg-location', path.dirname(ffmpegPath));
                }

                await ytDlpWrap.execPromise(args);

                const files = fs.readdirSync(tempDir);
                const downloadedFile = files.find(f => f.startsWith(baseFilename));

                if (downloadedFile) {
                    const media = MessageMedia.fromFilePath(path.join(tempDir, downloadedFile));
                    await client.sendMessage(chatId, media, { caption: 'Tá na mão! 😺' });
                    fs.unlinkSync(path.join(tempDir, downloadedFile));
                }
            } catch (e) {
                console.error(e);
                client.sendMessage(chatId, '❌ Erro ao baixar.');
            }
        }
    }
});

client.initialize();