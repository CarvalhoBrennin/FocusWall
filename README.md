# Focus Dashboard

App desktop em Tauri + Svelte para acompanhar tarefas do dia, relógio e câmbio.

## 🚀 **Setup Rápido (Recomendado)**

### **Para usuários finais - Instalação Automática**

Baixe e execute o instalador automático:

```
📦 Instalar-Focus-Setup.exe
```

**O que o instalador faz:**
- ✅ Instala Node.js LTS automaticamente
- ✅ Instala Rust e Cargo via rustup
- ✅ Instala Visual Studio Build Tools 2022
- ✅ Verifica WebView2 Runtime
- ✅ Baixa todas as dependências do projeto
- ✅ Compila e inicia o aplicativo

**Requisitos:**
- 🌐 Conexão com internet
- 🔐 Permissão de administrador
- 💾 Windows 10/11

---

## Stack

- Svelte 5
- Vite
- Tauri 2
- Rust

## 👩‍💻 **Para Desenvolvedores - Setup Manual**

### **Pré-requisitos**

- Node.js 20+ e npm
- Rust + Cargo (via rustup)
- Visual Studio Build Tools 2022 com `Desktop development with C++`
- WebView2 Runtime (já incluso no Windows 10/11)

**Diagnóstico do ambiente:**

```bash
npm run check:setup
```

## Rodar em desenvolvimento

```bash
npm install
npm run tauri:dev
```

Apenas a interface web no navegador:

```bash
npm run dev
```

## Gerar executável

```bash
npm install
npm run tauri:build
```

O executável gerado fica em `src-tauri/target/release/`.

## Recompilar o bootstrapper

Requer Rust instalado:

```bat
build-bootstrapper.bat
```

## Dados

- Preview web: `localStorage`
- App desktop: `dashboard-state.json` no AppData do usuário

## Documentação detalhada

Veja [SETUP.md](SETUP.md) para instruções completas de setup, erros comuns e checklist de validação.

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`
