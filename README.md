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

## Qualidade de engenharia

### Scripts de qualidade

| Comando | Descrição |
|---|---|
| `npm run lint` | Roda lint completo (frontend + Rust/Tauri) |
| `npm run lint:frontend` | ESLint para JS/Svelte |
| `npm run lint:rust` | Clippy com `-D warnings` |
| `npm run format` | Formata frontend (Prettier) e Rust (`cargo fmt`) |
| `npm run format:check` | Verifica formatação frontend sem alterar arquivos |
| `npm run format:rust:check` | Verifica formatação Rust sem alterar arquivos |
| `npm run test` | Suíte de testes (Vitest + Testing Library) |
| `npm run test:watch` | Testes em modo watch |
| `npm run test:smoke` | Smoke test mínimo de subida da aplicação |
| `npm run ci` | Pipeline local equivalente ao CI (format check + lint + test + build) |

### Escopo atual de testes

- **Normalização de tarefa e prioridade**: validações de texto, enum de prioridade e fallback seguro.
- **Retenção/histórico**: poda de histórico por janela de retenção.
- **Persistência/local state**: serialização e restauração do estado no `localStorage`.
- **Paginação/comportamento da lista**: paginação de tarefas e navegação da UI.
- **Smoke de aplicação**: renderização do shell principal sem crash.

### Como validar localmente

```bash
npm install
npm run ci
```

Se quiser executar em etapas:

```bash
npm run format:check
npm run format:rust:check
npm run lint
npm run test
npm run test:smoke
npm run build
```

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

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Estado do repositório

Este projeto já estava conectado ao remoto `canvabrennin-alt/FocusWall` e foi mantido sem troca de remoto, apenas com ajustes de documentação e higiene do versionamento.

## Deploy

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)


## Arquitetura (refactor incremental)

Resumo do refactor orientado a domínio/efeitos: [docs/architecture/refactor-2026-04.md](docs/architecture/refactor-2026-04.md).
