# Focus Dashboard

Dashboard desktop em `Tauri + Svelte` para acompanhar tarefas do dia, relógio local e câmbio BRL em uma interface pensada para ficar residente no ambiente do Windows.

## Visão geral

O projeto nasceu como um painel pessoal de produtividade e contexto rápido: tarefas, hora atual, câmbio e uma superfície desktop sempre disponível, com build web para preview e app nativo para uso real.

## Destaques

- app desktop em Tauri 2
- interface em Svelte 5
- bloco de tarefas do dia
- relógio em tempo real
- card de câmbio BRL
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
- indicador de onboarding: `ui.onboardingCompleted` no estado local

## Onboarding (primeira execução)

O FocusWall agora inclui um onboarding curto e orientado a ação para reduzir fricção na adoção inicial.

- Abre automaticamente na primeira execução (quando `ui.onboardingCompleted` ainda é `false`).
- Fluxo objetivo com 4 etapas:
  1. proposta de valor rápida
  2. confirmação de monitor + preferência de iniciar com Windows
  3. leitura guiada do painel
  4. sugestão de primeira tarefa para começar em segundos
- Ao concluir, o app salva o indicador de finalização e não reapresenta o fluxo indevidamente.
- O onboarding pode ser reaberto manualmente em **Configurações > Reabrir onboarding**.

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Estado do repositório

Este projeto já estava conectado ao remoto `canvabrennin-alt/FocusWall` e foi mantido sem troca de remoto, apenas com ajustes de documentação e higiene do versionamento.

## Deploy

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)

Configurações: [docs/SETTINGS.md](docs/SETTINGS.md)
