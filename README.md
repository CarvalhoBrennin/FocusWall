# Focus Dashboard

Dashboard desktop em `Tauri + Svelte` para acompanhar tarefas do dia, relógio local, câmbio BRL, calendário, arquivos, métricas do sistema e mídia em reprodução — pensado para ficar residente no ambiente do Windows.

## Visão geral

O projeto nasceu como um painel pessoal de produtividade e contexto rápido: tarefas, hora atual, câmbio e uma superfície desktop sempre disponível, com build web para preview e app nativo para uso real.

## Destaques

- app desktop em Tauri 2
- interface em Svelte 5
- bloco de tarefas do dia com histórico
- aba **Neural** — notas interligadas por `[[links]]`, backlinks, menções não vinculadas e grafo local
- calendário mensal com eventos
- painel de arquivos locais (pastas conhecidas + navegação)
- aba **Mídia** — now playing via SMTC (Windows), capas e controles
- aba **Sistema** — CPU, RAM, temperatura e apps com janela visível
- relógio em tempo real
- card de câmbio BRL
- seleção de monitor e autostart com Windows
- preview web para desenvolvimento
- bootstrapper opcional para setup automatizado no Windows

### Recursos presentes no código, mas ocultos na UI

- **OpenCode** — cliente visual para `opencode serve`; aba removida de `TaskHeader.svelte` e blocos comentados em `TaskPanel.svelte`. Reativar com `OPENCODE_TAB_ENABLED` em [`src/lib/features.ts`](src/lib/features.ts) e restaurar a entrada da aba no header + painel.
- **Vivarium** — painel experimental arquivado; desabilitado via `VIVARIUM_ENABLED` em [`src/lib/features.ts`](src/lib/features.ts). Blocos comentados apenas em `TaskPanel.svelte`. Ver [`src/lib/components/vivarium/ARCHIVED.md`](src/lib/components/vivarium/ARCHIVED.md).

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
| `npm run typecheck` | Verificação TypeScript |
| `npm run tauri:dev` | App desktop em modo dev |
| `npm run tauri:build` | Build nativo do Tauri (sem instalador) |
| `npm run tauri:build:installer` | Build nativo + bundle MSI |

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
- notas neurais: campo `neuralNotes` no mesmo estado persistido
- backup manual: exportação JSON nas configurações

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Documentação adicional

- Métricas do sistema: [`docs/PLAN-METRICS.md`](docs/PLAN-METRICS.md)
- Painel de arquivos: [`docs/PLAN-FILES.md`](docs/PLAN-FILES.md)
- Aba Neural: [`docs/PLAN-NEURAL.md`](docs/PLAN-NEURAL.md)
- Mídia / now playing: [`docs/PLAN-MEDIA.md`](docs/PLAN-MEDIA.md)
- Auto-update (stub): [`docs/UPDATER.md`](docs/UPDATER.md)
- Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Deploy

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)
