# Focus Dashboard

App desktop em Tauri + Svelte para acompanhar tarefas do dia, relógio e câmbio.

## Quickstart para desenvolvimento

```bash
npm install
npm run tauri:dev
```

Frontend no navegador:

```bash
npm run dev
```

Guia de entrega: [docs/DEPLOY.md](docs/DEPLOY.md)

## 🚀 **Setup Rápido (Recomendado)**

### **Para usuários finais - Instalação Automática**

Baixe e execute o instalador automático:

```
📦 Instalar-Focus-Setup.exe
```

**O que ele faz, nesta ordem:**
1. 🔐 Solicita permissão de administrador (UAC)
2. 📦 Instala **Node.js LTS** via winget (se ausente)
3. 🦀 Instala **Rust/Rustup** via winget (se ausente)
4. 🛠️ Instala **Visual Studio Build Tools 2022** com workload C++ via winget (se ausente)
5. 🌐 Instala **WebView2 Runtime** via winget (se ausente)
6. ⚙️ Atualiza o PATH e configura `rustup default stable`
7. 📥 Executa `npm install`
8. ✅ Roda `npm run check:setup` para validar o ambiente
9. 🔨 Compila o projeto com `npm run tauri:build` (pode levar vários minutos na primeira vez)
10. 🚀 Abre o executável nativo `src-tauri/target/release/Focus Dashboard.exe`

**Requisitos para o bootstrapper funcionar:**
- 💻 **Windows 10/11** com winget disponível (App Installer da Microsoft Store)
- 🌐 **Conexão com internet**
- 🔐 **Permissão de administrador**

### **Se o .exe não existe**

O bootstrapper precisa ser compilado a partir do código Rust em `tools/bootstrapper/`. Isso exige Rust já instalado:

```bat
build-bootstrapper.bat
```

O arquivo `Instalar-Focus-Setup.exe` será gerado na raiz do projeto.

---

## 👩‍💻 **Setup Manual (Para Desenvolvedores)**

### **2.1. Node.js**

Baixe e instale o Node.js 20+ (LTS): https://nodejs.org/

Verifique:
```bash
node -v
npm -v
```

### **2.2. Rust**

Instale via rustup: https://www.rust-lang.org/tools/install

Após instalar:
```bash
rustup default stable
rustc -V
cargo -V
```

### **2.3. Visual Studio Build Tools**

Baixe: https://visualstudio.microsoft.com/visual-cpp-build-tools/

Na instalação, selecione o workload **"Desktop development with C++"**.

### **2.4. WebView2**

Já vem instalado no Windows 10/11. Se estiver ausente (LTSC/Server):
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### **2.5. Dependências do projeto**

```bash
npm install
```

### **2.6. Validar ambiente**

```bash
npm run check:setup
```

Deve mostrar `OK` para todos os itens: Node.js, npm, cargo, rustc, Build Tools, WebView2.

---

## 🐛 **Erros Comuns e Soluções**

| Erro | Causa | Solução |
|------|-------|---------|
| `winget não encontrado` | Windows sem App Installer | Instale o App Installer pela Microsoft Store |
| `cargo: não encontrado` | Rust não instalado ou PATH desatualizado | Instale Rust e reabra o terminal |
| `npm: não encontrado` | Node não instalado ou PATH desatualizado | Instale Node.js e reabra o terminal |
| `Build Tools: não encontrado` | MSVC ausente | Instale VS Build Tools com workload C++ |
| `WebView2: não encontrado` | Raro em Win10/11; comum em LTSC | Instale manualmente pelo link acima |
| `error: linker 'link.exe' not found` | Build Tools sem componente C++ | Reinstale Build Tools com workload correto |
| `failed to bundle project` | Dependências Rust incompletas | Rode `cargo clean` em `src-tauri/` e tente novamente |
| Bootstrapper não acha a raiz | .exe está fora da árvore do projeto | Mova o .exe para dentro da pasta do projeto |

---

## ✅ **Checklist de Validação**

Depois do setup, confirme que tudo funciona:

- [ ] `node -v` retorna v20+
- [ ] `npm -v` retorna versão válida
- [ ] `rustc -V` retorna versão válida
- [ ] `cargo -V` retorna versão válida
- [ ] `npm run check:setup` mostra OK para todos os itens
- [ ] `npm run tauri:dev` abre o Focus Dashboard

---

## Stack

- Svelte 5
- Vite
- Tauri 2
- Rust

## 🏃 **Como Rodar o Projeto**

### Desenvolvimento (app desktop)
```bash
npm install
npm run tauri:dev
```

### Apenas frontend no navegador
```bash
npm install
npm run dev
```

### Build de produção
```bash
npm install
npm run tauri:build
```

O executável gerado fica em `src-tauri/target/release/`.

## 🔧 **Ferramentas do Projeto**

| Arquivo | Descrição |
|---------|-----------|
| `tools/check-setup.mjs` | Diagnóstico do ambiente (Node, Rust, Build Tools, WebView2) |
| `tools/bootstrapper/` | Código-fonte Rust do instalador automatizado |
| `build-bootstrapper.bat` | Compila o bootstrapper em `.exe` |

## Dados

- Preview web: `localStorage`
- App desktop: `dashboard-state.json` no AppData do usuário

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Estado do repositório

Este projeto já possui remoto GitHub configurado em `canvabrennin-alt/FocusWall` e foi mantido sem troca de remoto, apenas com ajuste de documentação e higiene do versionamento.
