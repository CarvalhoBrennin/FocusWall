# FocusWall - Hardening de segurança e runtime (Tauri)

## Objetivo
Este documento registra decisões de segurança aplicadas para reduzir superfícies frágeis sem quebrar o fluxo principal.

## Decisões aplicadas

### 1) Runtime Tauri sem exposição global
- `withGlobalTauri` foi alterado para `false`.
- O frontend não usa mais `window.__TAURI__` diretamente; todas as chamadas passam por `src/lib/services/tauri-api.js`.
- Benefício: reduz superfície global acessível por scripts de terceiros e força integração explícita por módulo.

### 2) Superfície de `invoke` controlada
- Criada uma lista explícita de comandos permitidos (`ALLOWED_COMMANDS`) e um wrapper `invokeCommand`.
- Comandos fora da allowlist são bloqueados no cliente antes de chegar ao backend.
- Benefício: reduz risco de uso acidental/indevido de comandos não previstos.

### 3) Configuração de segurança Tauri endurecida
- CSP saiu de `null` para política explícita com `default-src 'self'`, fontes e endpoint de câmbio permitidos.
- `core:webview:allow-internal-toggle-devtools` removido da capability padrão.
- Capability reduzida para `core:default` ao invés de permissões amplas e específicas não usadas.

### 4) Validações defensivas de estado no backend
- Estado é sanitizado em `load_state` e `save_state`.
- Limites aplicados: tamanho de arquivo, quantidade de datas, tarefas por dia, tamanho de texto/id.
- Normalização aplicada para prioridade, timestamps, datas e preferências de monitor.
- Arquivo de estado inválido/corrompido é tratado com fallback seguro para estado default.

### 5) Robustez de leitura/escrita do estado
- Escrita atômica via arquivo temporário foi mantida.
- Adicionada proteção contra arquivo de estado excessivo e contra symlink no caminho do estado.
- Em Unix, permissões do arquivo são corrigidas para `0600`.

### 6) Mitigação de injeção em HTML inline
- Fluxos de erro em `index.html` e `src/main.js` deixaram de usar `innerHTML`.
- Renderização agora usa `textContent` + elementos DOM, reduzindo vetor de XSS via mensagens de erro.

## Riscos residuais (aceitos por ora)
1. Há uso de `{@html}` para ícones SVG estáticos no Svelte.
   - Risco atual é baixo porque o conteúdo vem de constantes internas (não de input do usuário).
   - Próximo passo recomendado: migrar para componentes SVG sem `{@html}`.

2. A validação de timestamp ISO no backend é sintática (não semântica profunda).
   - Suficiente para robustez operacional.
   - Se necessário, evoluir para parser estrito com `chrono` e limites de intervalo.

3. A capability ainda usa `core:default`.
   - Já é menor que a configuração anterior, mas ainda pode ser reduzida após inventário completo de APIs realmente usadas.

## Checklist de segurança para release
- [ ] Revisar `tauri.conf.json` (CSP, `withGlobalTauri`, URLs externas permitidas).
- [ ] Revisar `src-tauri/capabilities/*.json` e remover permissões não usadas.
- [ ] Garantir que novos comandos Rust passem por validação de entrada e limites.
- [ ] Manter allowlist de `invoke` atualizada (`ALLOWED_COMMANDS`).
- [ ] Validar que nenhuma renderização de erro usa `innerHTML` com conteúdo dinâmico.
- [ ] Testar leitura/escrita de estado com arquivo corrompido, muito grande e com campos inválidos.
- [ ] Confirmar fluxo principal do app (bootstrap, tarefas, monitor, startup toggle) sem regressão.
