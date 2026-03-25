# Focus Dashboard

App desktop em Tauri + Svelte para acompanhar tarefas do dia, relogio e cambio.

## Stack

- Svelte 5
- Vite
- Tauri 2
- Rust

## Setup rapido (maquina nova)

Se voce recebeu este projeto em uma maquina Windows sem nada instalado, execute:

```bat
Instalar-Focus-Setup.exe
```

Esse executavel instala Node.js LTS, Rust, Visual Studio Build Tools, WebView2, as dependencias do projeto e abre o app automaticamente. Requer conexao com a internet e permissao de administrador.

> Se o `.exe` ainda nao foi compilado, veja [SETUP.md](SETUP.md) para instrucoes completas.

## Pre-requisitos (setup manual)

- Node.js 20+ e npm
- Rust + Cargo (via rustup)
- Visual Studio Build Tools 2022 com `Desktop development with C++`
- WebView2 Runtime (ja incluso no Windows 10/11)

Diagnostico do ambiente:

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

## Gerar executavel

```bash
npm install
npm run tauri:build
```

O executavel gerado fica em `src-tauri/target/release/`.

## Recompilar o bootstrapper

Requer Rust instalado:

```bat
build-bootstrapper.bat
```

## Dados

- Preview web: `localStorage`
- App desktop: `dashboard-state.json` no AppData do usuario

## Documentacao detalhada

Veja [SETUP.md](SETUP.md) para instrucoes completas de setup, erros comuns e checklist de validacao.

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`
