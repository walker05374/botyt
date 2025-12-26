# 🤖 Como Instalar o Bot no Termux (Android)

Siga estes passos na ordem para garantir que tudo funcione perfeitamente.

## 1. Preparação (Antes de baixar o bot)
Abra o Termux e digite estes comandos, um por um:

```bash
# 1. Atualize o Termux
pkg update -y && pkg upgrade -y

# 2. Dê permissão de armazenamento (Clique em Permitir no pop-up)
termux-setup-storage

# 3. Instale o Git e o Node.js iniciais
pkg install git nodejs -y
```

## 2. Instalação do Bot
Agora que o básico está pronto, baixe e instale o bot:

```bash
# 1. Clone o repositório
git clone https://github.com/walker05374/botyt.git

# 2. Entre na pasta
cd botyt

# 3. Dê permissão ao instalador
chmod +x instalar.sh

# 4. Rode o instalador automático (Vai fazer todo o resto)
./instalar.sh
```

## 3. Como Usar
Para iniciar o bot sempre que quiser:

```bash
cd botyt
node iniciar.js
```

## 🛠️ Resolução de Problemas
- **Erro de acesso negado no instalar.sh?** Rode `chmod +x instalar.sh`
- **Erro 'Chromium não encontrado'?** O script tenta instalar, mas se falhar, rode `pkg install chromium`.
- **QR Code não aparece?** Verifique se o comando `node iniciar.js` está rodando. Se o terminal ficar bagunçado, abra a imagem `qr.png` que será criada na pasta.
