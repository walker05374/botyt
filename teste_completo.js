const fs = require('fs');
const path = require('path');
const {
    fetchRecentItems,
    userLastProcessTime,
    saveMemory,
    isWindows,
    isTermux,
    extractLinks,
    messageHandler,
    client,
    ytDlpWrap
} = require('./iniciar');

// --- MOCKS AVANÇADOS ---

// 1. Mock do yt-dlp (SIMULA O DOWNLOAD)
ytDlpWrap.execPromise = async (args) => {
    console.log(`\n🎬 [MOCK YT-DLP] Executando comando fictício...`);
    // args tem [-o, ...]
    const outputIndex = args.indexOf('-o');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
        let outputPathTemplate = args[outputIndex + 1];
        // O codigo original usa .%(ext)s no template. Vamos substituir por .mp3
        // ou .mp4 dependendo dos args
        const ext = args.includes('mp3') ? 'mp3' : 'mp4';
        const finalPath = outputPathTemplate.replace('%(ext)s', ext);

        console.log(`🎬 [MOCK YT-DLP] Criando arquivo fake em: ${finalPath}`);

        // Cria o arquivo fisicamente para o fs.readdirSync encontrar
        try {
            if (!fs.existsSync(path.dirname(finalPath))) {
                fs.mkdirSync(path.dirname(finalPath), { recursive: true });
            }
            fs.writeFileSync(finalPath, 'fake media content');
        } catch (e) {
            console.error('Erro ao criar arquivo fake:', e);
        }
    }
    return Promise.resolve('Download Simulado OK');
};

// 1. Mock do Objeto "Chat"
const mockChat = {
    fetchMessages: async ({ limit }) => {
        const nowSec = Math.floor(Date.now() / 1000);
        return [
            { id: { _serialized: 'old_1' }, body: 'https://youtube.com/watch?v=old', timestamp: nowSec - 600, fromMe: false },
            { id: { _serialized: 'recent_insta' }, body: 'Olha: https://instagram.com/p/12345', timestamp: nowSec - 60, fromMe: false },
            { id: { _serialized: 'media_video' }, body: '', hasMedia: true, type: 'video', mimetype: 'video/mp4', timestamp: nowSec - 30, fromMe: false },
        ];
    },
    sendMessage: async (content) => {
        console.log(`[MOCK CHAT] Enviando mensagem...`);
    }
};

// 2. Mock da Função "Client.sendMessage" (Intercepta respostas do bot)
client.sendMessage = async (chatId, content, options) => {
    console.log(`\n🤖 [BOT REPLY] Para: ${chatId}`);
    if (content.mimetype) {
        console.log(`   Conteúdo: Mídia (${content.mimetype}) - ${content.filename || 'sem nome'}`);
    } else {
        console.log(`   Conteúdo: "${content}"`);
    }
    if (options) console.log(`   Opções:`, options);
    return true; // Sucesso
};

// 3. Factory de Mensagens (Cria mensagens falsas para teste)
const createMockMessage = (body, hasMedia = false, quotedMsg = null) => {
    return {
        from: '5511999999999@c.us',
        body: body,
        hasMedia: hasMedia,
        timestamp: Math.floor(Date.now() / 1000),
        getChat: async () => mockChat,
        reply: async (text) => {
            console.log(`\n🤖 [BOT REPLY (via msg.reply)] "${text}"`);
        },
        react: async (emoji) => {
            console.log(`\n😊 [BOT REACT] ${emoji}`);
        },
        hasQuotedMsg: !!quotedMsg,
        getQuotedMessage: async () => quotedMsg
    };
};

async function runTests() {
    console.log('🧪 INICIANDO TESTE COMPLETO DE FUNCIONALIDADE (MOCKED)');
    console.log('=======================================================');

    // TESTE 1: Extração de Links
    console.log('\n[1] Teste Unitário: Extração de Links');
    const links = extractLinks('Texto com https://youtu.be/test e lixo');
    if (links.includes('https://youtu.be/test')) console.log('   ✅ Extração OK');
    else console.error('   ❌ Falha na extração');

    // TESTE 2: Comando /ajuda
    console.log('\n[2] Teste: Comando /ajuda');
    await messageHandler(createMockMessage('/ajuda'));

    // TESTE 3: Comando /falar (TTS)
    // Isso vai tentar chamar o Google TTS API real, mas o envio será mockado
    console.log('\n[3] Teste: Comando /falar (Integração TTS)');
    await messageHandler(createMockMessage('/falar Testando áudio do bot'));

    // TESTE 4: Comando /baixar (Fluxo de Detecção)
    console.log('\n[4] Teste: Comando /baixar (Detecção de Links)');
    // O mockChat retorna um link do instagram recente. O bot deve detectá-lo.
    await messageHandler(createMockMessage('/baixar'));

    // Simular escolha do usuário (fase 2 do baixar)
    // Precisamos injetar o estado fictício pois o handler é stateless entre chamadas se não persistir
    // Mas o 'iniciar.js' mantem 'userStates' em memória global do módulo.
    // Vamos simular a RESPOSTA do usuário "1" (MP3)
    console.log('\n[4.1] Teste: Escolha de Download (Opção 1 - MP3)');
    console.log('      (Nota: Se o teste anterior falhou em setar o estado, este falhará silenciosamente)');
    await messageHandler(createMockMessage('1'));

    // TESTE 5: Comando /sticker (Erro esperado sem mídia)
    console.log('\n[5] Teste: Comando /sticker (Sem mídia)');
    await messageHandler(createMockMessage('/sticker'));

    console.log('\n=======================================================');
    console.log('🏁 FIM DOS TESTES');
    console.log('Se você viu as respostas do bot acima, o fluxo lógico está funcional!');
}

runTests();
