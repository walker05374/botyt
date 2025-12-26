const fs = require('fs');
const path = require('path');

const cleanCache = () => {
    // 1. Limpar pasta temp principal
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        try {
            const files = fs.readdirSync(tempDir);
            files.forEach(file => {
                const curPath = path.join(tempDir, file);
                try {
                    fs.unlinkSync(curPath);
                } catch (e) {
                    console.log(`⚠️ Erro ao deletar ${file}:`, e.message);
                }
            });
            console.log(`✅ Pasta temp limpa (${files.length} arquivos).`);
        } catch (e) {
            console.log('⚠️ Erro ao acessar temp:', e.message);
        }
    }

    // 2. Limpar caches do Navegador (Chrome/Puppeteer)
    // CUIDADO: Não apagar a pasta .wwebjs_auth inteira, apenas caches inúteis
    const authDir = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(authDir)) {
        const sessionDirs = fs.readdirSync(authDir).filter(f => f.startsWith('session-'));

        sessionDirs.forEach(session => {
            const defaultDir = path.join(authDir, session, 'Default');
            const dirsCleanup = ['Service Worker', 'CacheStorage', 'GPUCache', 'Code Cache'];

            dirsCleanup.forEach(d => {
                const target = path.join(defaultDir, d);
                if (fs.existsSync(target)) {
                    try {
                        fs.rmSync(target, { recursive: true, force: true });
                        console.log(`🧹 Cache removido: ${session}/.../${d}`);
                    } catch (e) { }
                }
            });
        });
    }

    // 3. Limpar cache de download do wwebjs
    const cacheDir = path.join(__dirname, '.wwebjs_cache');
    if (fs.existsSync(cacheDir)) {
        try {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            console.log('✅ .wwebjs_cache removido.');
        } catch (e) { }
    }
};

console.log('🚀 Iniciando limpeza profunda...');
cleanCache();
console.log('🎉 Limpeza concluída!');
