# Changelog

All notable changes to Focus Dashboard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
