# FocusWall

Dashboard desktop em `Tauri + Svelte` para acompanhar tarefas do dia, relógio local, câmbio BRL, calendário, arquivos, métricas do sistema e mídia em reprodução — pensado para ficar residente no ambiente do Windows.

## Visão geral

O projeto nasceu como um painel pessoal de produtividade e contexto rápido: tarefas, hora atual, câmbio e uma superfície desktop sempre disponível, com build web para preview e app nativo para uso real.

## Destaques

- app desktop em Tauri 2
- interface em Svelte 5
- bloco de tarefas do dia com histórico
- calendário mensal com eventos simples e recorrentes (mensal/anual, útil para aniversários)
- painel de arquivos locais (pastas conhecidas + navegação)
- aba **Música** — playlists próprias do YouTube/YouTube Music, OAuth desktop e player integrado
- aba **Sistema** — CPU, RAM, temperatura e apps com janela visível
- aba **Assistente** — comandos locais via Ollama, com inicialização automática no app desktop e contexto compacto para conversas longas
- relógio em tempo real
- card de câmbio BRL
- seleção de monitor e autostart com Windows
- preview web para desenvolvimento
- bootstrapper opcional para setup automatizado no Windows

### Recursos presentes no código, mas ocultos na UI

Altere apenas as flags em [`src/lib/features.ts`](src/lib/features.ts) — `TaskHeader` e `TaskPanel` reagem automaticamente.

- **Neural** — notas interligadas por `[[links]]`, backlinks, menções e grafo local; `NEURAL_TAB_ENABLED = false`.
- **OpenCode** — cliente visual para `opencode serve`; `OPENCODE_TAB_ENABLED = false`.
- **Vivarium** — painel experimental; `VIVARIUM_ENABLED = false`. Ver [`src/lib/components/vivarium/ARCHIVED.md`](src/lib/components/vivarium/ARCHIVED.md).

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
- Ollama para a aba Assistente (`winget install --id Ollama.Ollama -e`)
- Modelo local `qwen2.5:1.5b` para o assistente (`ollama pull qwen2.5:1.5b`)

## Bootstrapper

O Assistente preserva os últimos turnos completos, inclui logs de ações executadas no histórico recente e envia um contexto compacto dos turnos mais antigos para manter continuidade em conversas longas. Quando faltar informação essencial para executar uma ação, o prompt orienta o modelo a perguntar antes de alterar tarefas ou eventos.

O projeto inclui um bootstrapper opcional em `tools/bootstrapper/` para automatizar o setup do ambiente Windows. O executável `Instalar-Focus-Setup.exe` não fica versionado; ele deve ser gerado localmente quando necessário. O bootstrapper verifica WebView2, instala/verifica Ollama e baixa o modelo padrão `qwen2.5:1.5b` quando ele ainda não existe. Se o app for aberto sem o modelo local, a aba Assistente também oferece um botão para instalar o modelo padrão pelo próprio FocusWall.

Para compilar o bootstrapper:

```bat
build-bootstrapper.bat
```

## Dados

- preview web: `localStorage`
- app desktop: `dashboard-state.json` no AppData do usuário (inclui eventos recorrentes, favoritos e recentes de arquivos)
- notas neurais: campo `neuralNotes` no mesmo estado persistido
- backup manual: exportação JSON nas configurações

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Documentação adicional

- Métricas do sistema: [`docs/PLAN-METRICS.md`](docs/PLAN-METRICS.md)
- Painel de arquivos: [`docs/PLAN-FILES.md`](docs/PLAN-FILES.md)
- Aba Neural: [`docs/PLAN-NEURAL.md`](docs/PLAN-NEURAL.md)
- Música / YouTube: [`docs/PLAN-YOUTUBE-MUSIC.md`](docs/PLAN-YOUTUBE-MUSIC.md)
- Configuração do YouTube: [`docs/YOUTUBE-MUSIC-SETUP.md`](docs/YOUTUBE-MUSIC-SETUP.md)
- Auto-update (stub): [`docs/UPDATER.md`](docs/UPDATER.md)
- Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Deploy

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)

## Aba Radar

A aba **Radar** agrega condições meteorológicas e notícias de tecnologia/desenvolvimento em uma superfície única. No desktop, todas as chamadas externas são executadas pelo backend Rust; o frontend Svelte recebe somente modelos normalizados e não processa XML ou HTML remoto.

- Clima e busca de cidades: Open-Meteo.
- Notícias: GitHub Blog e Hacker News via RSS/Atom, processados no Rust por parser XML streaming com limites defensivos.
- Preferências persistidas no estado principal: cidade selecionada e categorias habilitadas.
- Cache operacional separado: `radar-cache-v2.sqlite` e a pasta local de imagens, não incluídos no backup funcional.
- A cidade e as coordenadas aproximadas permanecem no armazenamento local, mas a consulta meteorológica envia as coordenadas ao provider e a busca envia o texto somente após ação do usuário.
- O preview web usa dados fictícios identificados e não consulta os providers.

Os dados meteorológicos exigem atribuição ao Open-Meteo. A API gratuita possui condições específicas para uso não comercial; distribuições comerciais devem usar uma licença/plano apropriado ou substituir o provider na camada `src-tauri/src/radar/weather.rs`.

### Build desta revisão

Este pacote é distribuído como código-fonte. Binários Windows antigos foram removidos para evitar divergência entre fonte e executável. Gere um novo release com `npm ci`, validações frontend/Rust e `npm run tauri:build:installer`. O relatório detalhado das correções e limitações do ambiente está em [`docs/RADAR_IMPLEMENTATION_REPORT.md`](docs/RADAR_IMPLEMENTATION_REPORT.md).
