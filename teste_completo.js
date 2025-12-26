const fs = require('fs');
const path = require('path');
const { fetchRecentItems, userLastProcessTime, saveMemory, isWindows, isTermux } = require('./iniciar');

// --- MOCK OBJECTS ---
const mockChat = {
    fetchMessages: async ({ limit }) => {
        // Gera algumas mensagens com timestamps diferentes
        const nowSec = Math.floor(Date.now() / 1000);
        return [
            { id: { _serialized: 'old_1' }, body: 'https://youtube.com/watch?v=old', timestamp: nowSec - 600, fromMe: false }, // 10 min atrás
            { id: { _serialized: 'old_2' }, body: 'https://youtube.com/watch?v=recent', timestamp: nowSec - 60, fromMe: false }, // 1 min atrás
            { id: { _serialized: 'future' }, body: 'https://youtube.com/watch?v=future', timestamp: nowSec + 10, fromMe: false }, // Futuro (teste)
            { id: { _serialized: 'media_1' }, body: '', hasMedia: true, type: 'image', mimetype: 'image/jpeg', timestamp: nowSec - 100, fromMe: false },
            { id: { _serialized: 'media_2' }, body: '', hasMedia: true, type: 'video', mimetype: 'video/mp4', timestamp: nowSec - 60, fromMe: false }
        ];
    }
};

async function runTests() {
    console.log('🧪 INICIANDO TESTE COMPLETO DE LÓGICA DO BOT');
    console.log('==============================================');

    console.log(`🖥️ Ambiente: ${isWindows ? 'Windows' : 'Outro'} (Termux detectado? ${isTermux})`);

    // 1. Teste de Permissão de Arquivo
    console.log('\n[1] Testando Persistência (process_memory.json)...');
    try {
        const testFile = 'process_memory.json';
        const dummyData = { 'test_user': 123456 };

        // Simula salvamento via função do bot
        // Precisamos injetar dados no userLastProcessTime exportado?
        // Como userLastProcessTime é 'let' no modulo mas exportado por valor ou referencia?
        // Se exportado como objeto, é referencia. Se reatribuido, quebra.
        // No iniciar.js é 'let userLastProcessTime = {}'. 
        // Vamos checar se conseguimos modificar

        userLastProcessTime['test_user'] = 123456789;

        // Chama a função saveMemory do bot
        // Mas a função saveMemory usa a variavel local do modulo.
        // Se exportamos a função, ela vê a variável do módulo.

        // Warning: userLastProcessTime exportado no final do arquivo reflete o estado no momento do export?
        // Se for CommonJS, primitivos são cópia, objetos referência. É um objeto.

        // Tenta salvar via logica
        // A função saveMemory do modulo usa a variavel do modulo.
        // Mas precisamos garantir que a variavel do modulo tenha o dado.
        // Como acessar?
        // 'userLastProcessTime' importado aponta para o objeto.
        // Se o modulo fizer 'userLastProcessTime = ...' perde a referencia.
        // No iniciar.js: 'userLastProcessTime = JSON.parse(...)' reatribui a variavel!
        // ISSO É UM BUG POTENCIAL NA EXPORTAÇÃO.
        // Se a variavel é reatribuida, o export antigo aponta para o objeto velho/vazio.

        console.log('⚠️ Verificação de Design: Se "userLastProcessTime" for reatribuído no load, o export pode estar desatualizado.');

    } catch (e) {
        console.error('❌ Erro no teste 1:', e);
    }

    // 2. Teste da Lógica de Janela de Tempo
    console.log('\n[2] Testando Lógica de Janela de Tempo (fetchRecentItems)...');

    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const tenMinutesAgo = now - 600000;

    // Caso A: Reset total (lastTime = 0)
    // Deve pegar mensagens recentes (padrão 0?)
    // O código usa: start = minTimestamp || 0.
    // Se passarmos 0, pega tudo desde 1970 ate agora.

    console.log('👉 Cenário A: Bot "esqueceu" (LastTime = 0) e Comando Agora');
    // simulation: user sends command NOW. lastTime is 0.
    const itemsA = await fetchRecentItems(mockChat, 'links', 0, now);
    console.log(`   Itens encontrados: ${itemsA.length}`);
    // Esperado: Pegar tudo que tem no mock (3 links? nao, fetchRecent usa timestamp filtered)
    // Mock tem: -600s, -60s, +10s.
    // start=0, end=now.
    // Deve pegar -600s e -60s. (2 itens)
    if (itemsA.length >= 2) console.log('   ✅ Passou (Pegou histórico antigo pq lastTime=0)');
    else console.error('   ❌ Falhou');

    // Caso B: Persistência Funcionando (LastTime = 2 min atrás)
    console.log('\n👉 Cenário B: Bot com memória (LastTime = 2 min atrás)');
    // simulation: lastTime = now - 120000 (2 min)
    const itemsB = await fetchRecentItems(mockChat, 'links', now - 120000, now);
    console.log(`   Itens encontrados: ${itemsB.length}`);
    // Esperado:
    // -600s (10 min atras): IGNORAR (< start)
    // -60s (1 min atras): PEGAR (> start)
    if (itemsB.length === 1) console.log('   ✅ Passou (Ignorou o item de 10 min atrás)');
    else {
        console.error(`   ❌ Falhou. Encontrou ${itemsB.length} itens (Esperado 1).`);
        console.log('   Isso indica que o bot ESTÁ PEGANDO ITENS ANTIGOS mesmo com lastTime definido.');
    }

    // Caso C: Reset no momento do comando
    console.log('\n[3] Testando "Ciclo de Reset"');
    console.log('   Simulando: Usuário mandou comando às 10:00.');
    const commandTime1 = now;
    // O bot salvaria userLastProcessTime = commandTime1

    console.log('   Simulando: Usuário manda outro comando às 10:05.');
    const commandTime2 = now + 300000;

    // O fetch deve buscar entre commandTime1 e commandTime2
    const itemsC = await fetchRecentItems(mockChat, 'links', commandTime1, commandTime2);
    // Como mock só tem msg antiga, deve dar 0.
    console.log(`   Itens encontrados (janela futura): ${itemsC.length}`);

    if (itemsC.length === 0) console.log('   ✅ Passou (Janela limpa, não pegou velharias)');
    else console.error('   ❌ Falhou (Pegou item antigo!)');


    console.log('\n==============================================');
    console.log('🏁 FIM DO TESTE');
}

runTests();
