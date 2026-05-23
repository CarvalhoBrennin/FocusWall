# Focus Dashboard

Dashboard desktop em `Tauri + Svelte` para acompanhar tarefas do dia, relógio local, câmbio BRL, calendário, arquivos e terminal OpenCode — pensado para ficar residente no ambiente do Windows.

## Visão geral

O projeto nasceu como um painel pessoal de produtividade e contexto rápido: tarefas, hora atual, câmbio e uma superfície desktop sempre disponível, com build web para preview e app nativo para uso real.

## Destaques

- app desktop em Tauri 2
- interface em Svelte 5
- bloco de tarefas do dia com histórico
- calendário mensal com eventos
- painel de arquivos locais
- terminal OpenCode integrado
- relógio em tempo real
- card de câmbio BRL
- seleção de monitor e autostart com Windows
- preview web para desenvolvimento
- bootstrapper opcional para setup automatizado no Windows

## Stack

- Svelte 5
- Vite
- Tauri 2
- Rust

## Quickstart

Desenvolvimento desktop:

```bash
npm install
npm run tauri:dev
```

Preview web:

```bash
npm run dev
```

Build web:

```bash
npm run build
```

Build desktop:

```bash
npm run tauri:build
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run check:setup` | Diagnóstico do ambiente local |
| `npm run dev` | Preview web |
| `npm run build` | Build web |
| `npm run preview` | Preview do build |
| `npm run test` | Testes unitários (Vitest) |
| `npm run tauri:dev` | App desktop em modo dev |
| `npm run tauri:build` | Build nativo do Tauri |

## Requisitos do ambiente desktop

- Windows 10/11
- Node.js 20+
- Rust toolchain
- Visual Studio Build Tools com workload C++
- WebView2

## Bootstrapper

O projeto inclui um bootstrapper opcional em `tools/bootstrapper/` para automatizar o setup do ambiente Windows. O executável `Instalar-Focus-Setup.exe` não fica versionado; ele deve ser gerado localmente quando necessário.

Para compilar o bootstrapper:

```bat
build-bootstrapper.bat
```

## Dados

- preview web: `localStorage`
- app desktop: `dashboard-state.json` no AppData do usuário
- backup manual: exportação JSON nas configurações

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Deploy

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)
