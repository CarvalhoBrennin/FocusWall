# Changelog

All notable changes to Focus Dashboard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Aba **Mídia** — sessão SMTC (Windows), capas HD resolvidas no backend Rust, controles de reprodução
- Aba **Sistema** — CPU, RAM, temperatura (WMI) e apps com janela visível ([`docs/PLAN-METRICS.md`](docs/PLAN-METRICS.md))
- Comandos Tauri de mídia: `get_media_snapshot`, `get_media_artwork`, `media_toggle_playback`, `media_skip_next`, `media_skip_previous`
- Feature flags em [`src/lib/features.ts`](src/lib/features.ts): `OPENCODE_TAB_ENABLED`, `VIVARIUM_ENABLED`

### Changed

- Aba **OpenCode** oculta na UI (código e comandos Tauri permanecem; ver [`docs/AUDIT-FEATURE-OPENCODE.md`](docs/AUDIT-FEATURE-OPENCODE.md))
- Painel **Vivarium** permanece arquivado (`VIVARIUM_ENABLED = false`)

## [0.1.0] - 2026-05-22

### Added

- Calendário mensal com eventos e integração com tarefas
- Painel de arquivos com navegação local
- Terminal OpenCode integrado
- Seletor de monitor e preferência persistente
- Autostart com Windows
- Exportação de backup do estado local
- Testes unitários básicos (Vitest)
- CI com build web automatizado

### Security

- Content Security Policy em produção (Tauri + HTML)
- Remoção de DevTools em builds de release
- Desabilitação de `withGlobalTauri`
- Validação de paths em comandos de filesystem
- Atualização de dependências com CVEs conhecidas

### Fixed

- Race condition na escrita atômica do estado
- Migração de versão do schema de persistência
- Focus trap e foco inicial nos modais
- Retry com backoff na API de câmbio
- Persistência do último diretório no painel Arquivos
- Acessibilidade: toast dismissível, roving tabindex no calendário, aria-describedby no composer
