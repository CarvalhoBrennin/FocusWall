# Plano — Aba Assistente (FocusWall nativo)

> **Objetivo:** nova aba **Assistente** no FocusWall — chat somente texto que **opera o próprio dashboard** (tarefas, calendário, navegação de datas). Feature **100% independente**, sem qualquer dependência do projeto AM.
>
> **Decisões fixadas:**
> - LLM: **Ollama local** (`http://127.0.0.1:11434`)
> - Nome da aba: **Assistente**
> - **Sem persistência** de histórico de chat (sessão em memória; ao fechar/reabrir o app, conversa some)

---

## Sumário executivo

| Aspecto | Decisão |
|---------|---------|
| Escopo | Operar FocusWall via linguagem natural |
| Motor | Ollama local (modelo configurável, ex. `qwen2.5:3b` ou `llama3.2:3b`) |
| UI | Nova aba lazy-loaded, estilo brutalista dos outros painéis |
| Estado do chat | Só em memória (`$state` no componente ou store efêmero) |
| Dados do app | Reutiliza `app-store.ts` + `calendar-store.ts` + `dashboard-state.json` |
| AM | **Nenhuma conexão** |

**Princípio:** o assistente não é um chat genérico. É um **operador do FocusWall** com um conjunto fechado de ações (tools) que chamam as mesmas funções que a UI já usa.

---

## 1. Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  AssistantPanel.svelte                                  │
│  ├─ lista de mensagens (sessão atual)                   │
│  ├─ composer (Enter envia, Shift+Enter quebra linha)  │
│  └─ status: conectado / pensando / executando ação    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  assistant-service.ts                                   │
│  ├─ monta system prompt + contexto FocusWall            │
│  ├─ chama Ollama POST /api/chat (stream)                │
│  ├─ interpreta tool calls do modelo                     │
│  └─ executa tools → app-store / calendar-store          │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
   Ollama (local)              FocusWall stores
   127.0.0.1:11434            addTask, toggleTask,
                               addCalendarEvent, …
```

### Por que não AM

- AM é um produto separado (WinUI + ASP.NET + memória + voz + tools desktop).
- O Assistente FocusWall precisa apenas de **ações sobre o estado local** já modelado em `AppState`.
- Menos moving parts: sem sidecar HTTP, sem SQLite externo, sem sincronização entre apps.

### Por que Ollama direto (não via Rust no MVP)

- Ollama já expõe HTTP local; padrão igual ao `exchange.ts` (fetch externo).
- MVP: `fetch` do frontend para `http://127.0.0.1:11434/api/chat`.
- **CSP:** adicionar `http://127.0.0.1:11434` em `connect-src` em `src-tauri/tauri.conf.json`.
- Fase futura opcional: proxy em Rust se quiser esconder URL ou validar tools no backend.

---

## 2. Integração na UI existente

### 2.1 Feature flag e aba

**Arquivos a alterar:**

| Arquivo | Mudança |
|---------|---------|
| `src/lib/types/app.ts` | `PanelTab` += `'assistant'` |
| `src/lib/features.ts` | `ASSISTANT_TAB_ENABLED = true`, entrada em `PANEL_TAB_DEFINITIONS` |
| `src/lib/i18n/messages.ts` | `tasks.assistant` → `"Assistente"` / `"Assistant"` |
| `src/lib/components/TaskHeader.svelte` | `headline` / `kicker` para aba `assistant` |
| `src/lib/components/TaskPanel.svelte` | lazy import `AssistantPanel.svelte` |
| `src/lib/stores/ui-store.ts` | `isPanelTabEnabled('assistant')` já cobre via flags |

Ordem sugerida na barra de abas: após **Mídia** ou antes de **Sistema** (decisão de UX; sugerido após Execução para destaque).

### 2.2 Novos arquivos

```
src/lib/
├── components/assistant/
│   ├── AssistantPanel.svelte      # layout principal
│   ├── AssistantMessageList.svelte
│   ├── AssistantComposer.svelte
│   └── AssistantStatusBar.svelte    # modelo, Ollama online/offline
├── services/
│   ├── ollama.ts                    # cliente HTTP + stream
│   └── assistant.ts                 # orquestração, tools, contexto
├── assistant/
│   ├── tools.ts                     # definições + executores
│   ├── context.ts                   # snapshot do estado para o prompt
│   └── prompts.ts                   # system prompt em PT
└── types/
    └── assistant.ts                 # Message, ToolCall, AssistantConfig
```

**CSS:** `src/styles/assistant.css` importado lazy no painel (como `neural.css`).

---

## 3. Tools — o que o assistente pode fazer

Cada tool chama funções **já existentes** (nunca escrever direto no JSON de estado).

### 3.1 MVP (Fase 1)

| Tool | Função FocusWall | Descrição para o modelo |
|------|------------------|-------------------------|
| `list_tasks` | `visibleTasks` / leitura de `data` | Lista tarefas do dia visível |
| `add_task` | `addTask(text, priority)` | Cria tarefa no dia atual |
| `complete_task` | `toggleTask(id)` | Marca concluída / reabre |
| `delete_task` | `deleteTask(id)` | Remove tarefa |
| `set_task_priority` | `cycleTaskPriority` ou `updateTask` | Altera prioridade |
| `pin_task` | `toggleTaskPin(id)` | Fixa / desfixa |
| `get_context` | `buildContext()` | Data visível, contagem de tarefas, eventos do dia |

### 3.2 Fase 2

| Tool | Função | Descrição |
|------|--------|-----------|
| `list_calendar_events` | `getEventsForDateKey` | Eventos de um dia |
| `add_calendar_event` | `addCalendarEvent` | Novo evento |
| `update_calendar_event` | `updateCalendarEvent` | Edita evento |
| `delete_calendar_event` | `deleteCalendarEvent` | Remove evento |
| `go_to_date` | `setExecutionDateForDateKey` | Muda dia visível |
| `go_to_today` | `setViewOffset(VIEW.TODAY)` | Volta para hoje |

### 3.3 Fora de escopo

- Arquivos, mídia, métricas de sistema, notas neurais
- Editar código, OpenCode, comandos shell
- Memória de longo prazo / RAG
- Voz

---

## 4. Fluxo de uma mensagem

1. Usuário envia texto no composer.
2. Mensagem user entra na lista **em memória**.
3. `assistant.ts` monta:
   - **System prompt:** papel, regras, lista de tools, tom em PT-BR.
   - **Contexto:** JSON compacto (data visível, tarefas resumidas, eventos do dia).
   - **Histórico:** mensagens da sessão atual (não persistidas).
4. `POST /api/chat` no Ollama com `stream: true` e `tools` (se o modelo suportar).
5. Se o modelo retorna **tool call**:
   - Executar tool em `tools.ts`.
   - Anexar resultado como mensagem `tool`.
   - Nova rodada ao Ollama até resposta final em texto.
6. Mensagem assistant (stream) aparece na UI.
7. Toast opcional quando uma ação altera tarefas (`showToast`).

### Modelos Ollama recomendados

| Modelo | Uso | Tool calling |
|--------|-----|--------------|
| `qwen2.5:3b` | MVP leve, rápido | Suporta tools em versões recentes |
| `llama3.2:3b` | Alternativa | Verificar suporte a tools na build local |
| `qwen2.5:7b` | Melhor qualidade | Mais lento |

**Fallback sem tools nativos:** pedir JSON estruturado no system prompt (`{"action":"add_task","args":{...}}`) e parsear no `assistant.ts`. Menos robusto, mas funciona com modelos pequenos.

Config sugerida em `src/lib/config.ts`:

```typescript
ASSISTANT: {
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  streamIdleTimeoutMs: 60_000,
}
```

---

## 5. UI/UX

Referências visuais: `OpenCodeChat.svelte` (lista + composer), `SystemPanel` (stack vertical), tokens em `tokens.css`.

### Layout

```
┌──────────────────────────────────────────┐
│  [status] Ollama ●  modelo: qwen2.5:3b   │
├──────────────────────────────────────────┤
│                                          │
│  Você: adiciona comprar leite            │
│                                          │
│  Assistente: Pronto. Adicionei "comprar   │
│  leite" como prioridade média.           │
│                                          │
│  [ação] ✓ add_task · comprar leite       │  ← chip opcional quando tool rodou
│                                          │
├──────────────────────────────────────────┤
│  [ textarea composer          ] [Enviar] │
└──────────────────────────────────────────┘
```

### Comportamentos

- Enter envia; Shift+Enter quebra linha.
- Scroll automático ao fim.
- Streaming com cursor piscando na bolha assistant.
- Estado **offline** se `GET /api/tags` falhar → mensagem clara: “Inicie o Ollama”.
- Sem sidebar de sessões, sem histórico salvo.
- Botão “Limpar conversa” reseta só a sessão em memória.

### i18n

Chaves mínimas em `messages.ts`: `tasks.assistant`, `assistant.placeholder`, `assistant.offline`, `assistant.thinking`, `assistant.clearChat`.

---

## 6. Contexto enviado ao modelo

`context.ts` gera snapshot **somente leitura** a cada turno:

```json
{
  "visibleDate": "2026-07-01",
  "viewOffset": 0,
  "tasks": [
    { "id": "abc", "text": "Revisar PR", "completed": false, "priority": "high", "pinned": false }
  ],
  "eventsToday": [
    { "id": "evt1", "title": "Dentista", "startTime": "14:00" }
  ]
}
```

Regras no system prompt:

- Sempre usar IDs retornados em `list_tasks` para editar/remover.
- Confirmar em texto o que foi feito.
- Não inventar tarefas que não existem no contexto.
- Prioridades: `high` | `medium` | `low`.

---

## 7. Segurança e limites

| Risco | Mitigação |
|-------|-----------|
| Modelo alucina IDs | Tools validam ID; erro amigável se não existir |
| `delete_task` destrutivo | MVP: executar direto; Fase 2: confirmar no chat para deletes em lote |
| Ollama exposto na rede | Documentar: manter bind em localhost |
| CSP bloqueia fetch | `connect-src` inclui `http://127.0.0.1:11434` |
| Loop infinito de tools | Máx. 5 rodadas tool→modelo por mensagem do usuário |

**Não persistir:** conversas não vão para `dashboard-state.json` nem `localStorage`.

---

## 8. Plano de implementação (fases)

### Fase 0 — Pré-requisitos (S, ~0,5 dia)

1. Ollama instalado; `ollama pull qwen2.5:3b`
2. Testar: `curl http://127.0.0.1:11434/api/tags`
3. Atualizar CSP em `tauri.conf.json`

### Fase 1 — MVP (M, ~3–4 dias)

1. Flag + aba Assistente (`features.ts`, `TaskPanel`, i18n)
2. `ollama.ts` — health check + stream chat
3. `tools.ts` — 6 tools de tarefas
4. `assistant.ts` — loop tool calling
5. `AssistantPanel.svelte` — UI mínima funcional
6. Testes unitários: `tools.ts`, parse de tool calls, `context.ts`

**Critério de pronto:** “adiciona tarefa X”, “marca a primeira como feita”, “o que tenho hoje?” funcionam com Ollama rodando.

### Fase 2 — Calendário e datas (S–M, ~2 dias)

1. Tools de calendário + navegação de data
2. Chips de ação na UI
3. Melhorar system prompt com exemplos

### Fase 3 — Polish (S, ~1–2 dias)

1. Settings: escolher modelo Ollama (dropdown de `/api/tags`)
2. Indicador de streaming mais suave
3. Atalho de teclado para abrir aba (opcional)

### Fase 4 — Opcional futuro

- Proxy Rust para Ollama
- Confirmação explícita antes de deletes
- Integração com toast + undo do `deleteTask`

---

## 9. Estimativa de esforço

| Fase | Tamanho | Tempo focado |
|------|---------|--------------|
| 0 | S | meio dia |
| 1 (MVP) | M | 3–4 dias |
| 2 | S–M | 2 dias |
| 3 | S | 1–2 dias |

**MVP utilizável (Fases 0+1):** ~**M** (4 dias)

---

## 10. Mapa de arquivos de referência (FocusWall)

| Papel | Caminho |
|-------|---------|
| Tarefas | `src/lib/stores/app-store.ts` — `addTask`, `toggleTask`, `deleteTask`, … |
| Calendário | `src/lib/stores/calendar-store.ts` |
| Tipos | `src/lib/types/app.ts` |
| Tabs / flags | `src/lib/features.ts` |
| Lazy panel | `src/lib/components/TaskPanel.svelte` |
| Precedente chat UI | `src/lib/components/OpenCodeChat.svelte` (só layout, não serviço) |
| Fetch externo | `src/lib/services/exchange.ts` |
| CSP | `src-tauri/tauri.conf.json` |
| Plano de aba similar | `docs/PLAN-NEURAL.md` |

---

## 11. Checklist de validação manual

1. Ollama parado → aba mostra offline, não trava o app
2. “Adiciona reunião com cliente amanhã às 10h” → tarefa ou evento criado (conforme fase)
3. “Marca X como feita” → `toggleTask` reflete na aba Execução
4. Trocar de aba e voltar → chat da sessão ainda em memória
5. Fechar e reabrir app → chat vazio (sem histórico)
6. Modelo sem tool support → fallback JSON ainda funciona

---

*Documento atualizado em 01/07/2026 — Assistente nativo FocusWall, Ollama local, sem AM, sem persistência de chat.*
