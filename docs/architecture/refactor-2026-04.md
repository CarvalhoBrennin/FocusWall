# Refactor arquitetural (abril/2026)

## Antes

- `app-store.js` concentrava estado + regras de negócio + persistência + runtime timers + fluxo de câmbio.
- Funções de tarefas (ordenação por fixação, remoção/undo, edição, movimentação) estavam acopladas ao acesso de store.
- Fluxos de persistência (debounce/snapshot) e runtime (timers/pause) estavam misturados com regras de domínio.

## Depois

Estrutura incremental por domínio/efeito:

- `src/lib/domain/tasks/task-domain.js`
  - regras puras de tarefas (criação, toggle, pin/unpin, move, delete/restore).
- `src/lib/domain/settings/settings-domain.js`
  - regras de configuração e snapshot de UI persistível.
- `src/lib/domain/exchange/exchange-domain.js`
  - regras puras de câmbio (metadados, baseline, validação de exibição).
- `src/lib/effects/persistence/persistence-effects.js`
  - efeito explícito de persistência do snapshot de estado.
- `src/lib/runtime/runtime-effects.js`
  - efeitos de runtime (detecção de pause e timers).
- `src/lib/stores/app-store.js`
  - store mais fina: orquestra estado + chama domínio/efeitos.

## Benefícios de manutenção

1. **Clareza de responsabilidades**: domínio separado de IO/runtime.
2. **Escalabilidade incremental**: novas features entram por domínio sem inflar store.
3. **Testabilidade**: regras críticas agora testadas em `node:test` sem depender de Svelte store.
4. **Migração segura**: API pública principal da store preservada (ex.: `addTask`, `toggleTask`, `updateExchangeRates`).
