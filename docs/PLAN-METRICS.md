# Métricas do sistema — Aba Sistema

## Objetivo

Aba **Sistema** no painel principal (`TaskPanel`) com CPU, RAM, temperatura (WMI), hardware e lista de aplicativos com janela visível — estilo Gerenciador de Tarefas, com polling leve.

## Implementação

### Backend (Rust)

- Módulo [`src-tauri/src/metrics/`](../src-tauri/src/metrics/)
- Comando Tauri: `get_system_snapshot({ topApps? })` — parâmetro camelCase no invoke; default **15** no frontend ([`system-metrics.ts`](../src/lib/services/system-metrics.ts))
- `sysinfo` — CPU/RAM/processos
- `wmi` (Windows) — temperatura CPU (cache 30s no Rust)
- `EnumWindows` — filtrar apps com janela visível
- Permissão: [`src-tauri/permissions/app-commands.toml`](../src-tauri/permissions/app-commands.toml)

### Frontend

- Serviço: [`src/lib/services/system-metrics.ts`](../src/lib/services/system-metrics.ts) — poll 4s, pausa com `paused` e aba inativa
- UI: [`src/lib/components/system/`](../src/lib/components/system/)
- Tab: `panelTab === 'system'` em [`ui-store.ts`](../src/lib/stores/ui-store.ts)

## Performance

| Parâmetro | Valor |
|-----------|--------|
| Intervalo UI | 4000 ms |
| Cache WMI | 30 s |
| Top apps | 15 (agrupados por `.exe`) |
| Poll ativo | só aba Sistema + app não pausado |

## InfoRail (opcional)

Card compacto CPU/RAM no `InfoRail` pode reutilizar `fetchSystemSnapshot()` — não implementado na v1 da aba.

## Testes

- `src/lib/services/system-metrics.test.ts` — normalização JSON
- Manual: comparar top apps com Gerenciador de Tarefas; temp `—` em PCs sem sensor WMI
