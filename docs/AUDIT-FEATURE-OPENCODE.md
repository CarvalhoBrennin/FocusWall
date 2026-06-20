# Auditoria da Feature OpenCode — Terceira Rodada (Deep Audit)

> **Status da UI (Jun/2026):** A aba OpenCode está comentada/oculta em `TaskHeader.svelte` e `TaskPanel.svelte`. Backend, comandos Tauri e componentes permanecem no repositório. Reativar com `OPENCODE_TAB_ENABLED = true` em `src/lib/features.ts`.

> **Correções pós-auditoria (Jun/2026):** Parcialmente endereçados — **C2** (`stoppingServer` + await em `destroyServer`), **H1** (`clearTimeout`), **H3** (checagem de campo `error` em `opencode_get_with_retry`), **H4** (early break em `search_project_dirs`), **M1/M2** (`console.warn`). **C1** (mutex durante startup) e **C4** (mutex sob syscalls) permanecem abertos.

> **Data**: 2026-05-24 | **Versao**: 0.1.0 | **Severidade global**: CRITICA — race conditions remanescentes no Rust (C1, C4)

---

## Resumo

Apos correcao de 40 problemas nas duas primeiras rodadas, uma auditoria profunda encontrou **29 novos problemas**: 4 criticos, 6 altos, 10 medios, 9 baixos. A feature compila e passa testes, mas tem race conditions no Rust e no frontend que so se manifestam em uso real (concorrencia, troca rapida de abas).

---

## 1. Problemas Criticos

### C1 — Race condition: double mutex lock em `start_opencode_server` [CRITICO]

| Campo | Valor |
|---|---|
| **Arquivo** | `src-tauri/src/lib.rs:362-444` |
| **Severidade** | Critico |
| **Impacto** | Em concorrencia, pode matar servidor de outro projeto ou deixar zombie process |

**Descricao**: O lock do mutex e adquirido, liberado, e readquirido — ha uma janela onde outro comando pode modificar o estado:

```rust
// Lock #1 (linhas 362-387)
{
    let mut guard = state.opencode_server.lock()...;
    // ... verifica servidor existente ...
    stop_opencode_server_locked(&mut guard);
} // ← lock liberado aqui

// ... inicia novo servidor (linhas 389-438) — lock NAO segurado ...

// Lock #2 (linhas 439-448)
let mut guard = state.opencode_server.lock()...;
stop_opencode_server_locked(&mut guard);  // ← pode matar servidor de outra chamada
*guard = Some(...);
```

Entre o lock #1 e o lock #2, outro comando Tauri (outro `start_opencode_server`, `stop_opencode_server`, ou comando HTTP) pode modificar `opencode_server`. Ao readquirir, o codigo sobrescreve cegamente.

**Correcao**: Segurar o lock durante toda a sequencia de startup.

---

### C2 — `destroyServer()` nao e awaited antes de `initializeWorkspace()` [CRITICO]

| Campo | Valor |
|---|---|
| **Arquivo** | `OpenCodeChat.svelte:370-391` |
| **Severidade** | Critico |
| **Impacto** | Troca rapida de abas pode iniciar novo servidor enquanto o antigo ainda esta sendo morto |

**Descricao**: O `$effect` chama `destroyServer()` sem `await`:

```js
async function destroyServer() {
    stopPolling();
    try { await stopOpenCodeServer(); } catch { }
}

$effect(() => {
    if (!active || !workdir) {
      destroyServer();  // ← Promise nao awaited!
      return;
    }
    untrack(() => {
      if (initializedPath !== workdir) {
        initializedPath = workdir;
        initializeWorkspace(workdir);  // ← pode rodar antes do destroy terminar
      }
    });
});
```

Se o usuario trocar de aba e voltar rapidamente, `destroyServer` pode ainda estar matando o processo enquanto `initializeWorkspace` tenta iniciar um novo. O `runId` so previne resultados stale, nao execucao concorrente.

**Correcao**: Usar flag `destroying` para bloquear `initializeWorkspace` ate o destroy completar.

---

### C3 — Rust retorna `serde_json::Value`, TypeScript espera tipos estruturados — sem validacao [CRITICO]

| Campo | Valor |
|---|---|
| **Arquivo** | `lib.rs:468-563` + `opencode.ts:12-52` |
| **Severidade** | Critico |
| **Impacto** | Respostas da API com formato inesperado causam erros silenciosos ou `undefined` |

**Descricao**: 7 comandos Tauri retornam `serde_json::Value` (JSON nao tipado). O TypeScript declara tipos exatos (`OpenCodeSessionInfo`, `OpenCodeMessage`, etc.) mas nao ha validacao em runtime. Se a API do OpenCode retornar `{ sessions: [...] }` em vez de `{ data: [...] }`, `unwrapList` retorna `[]` silenciosamente. Se `message.info` for `null`, o template quebra ao acessar `.role`.

```rust
// Rust: saida nao validada
fn list_opencode_sessions(...) -> Result<Value, String> { ... }

// TypeScript: tipo assumido, sem verificacao
export type OpenCodeSessionInfo = { id?: string; ... };
```

**Correcao**: Adicionar validacao runtime (type guards ou console.warn para shapes inesperados).

---

### C4 — `active_opencode_base_url` bloqueia mutex com chamadas OS [CRITICO]

| Campo | Valor |
|---|---|
| **Arquivo** | `src-tauri/src/lib.rs:657-676` |
| **Severidade** | Critico |
| **Impacto** | Toda chamada de API bloqueia se o SO demorar para fazer reap do processo |

**Descricao**: Sob o mutex, o codigo chama `child.try_wait()` (syscall bloqueante), e se o processo morreu, chama `child.kill()` + `child.wait()` (mais syscalls bloqueantes):

```rust
fn active_opencode_base_url(state: &RuntimeState) -> Result<String, String> {
    let mut guard = state.opencode_server.lock()...;  // mutex held
    if let Some(server) = guard.as_mut() {
        if server.child.try_wait()...?.is_none() {     // OS call sob mutex
            return Ok(server.base_url.clone());
        }
    }
    stop_opencode_server_locked(&mut guard);           // kill + wait sob mutex
    Err(...)
}
```

Essa funcao e chamada por TODOS os comandos HTTP (GET, POST). Se o SO demorar para dar reap no processo zumbi, todo o pipeline de comandos OpenCode bloqueia.

**Correcao**: Mover `try_wait` para fora do lock, ou usar `try_lock` com fallback.

---

## 2. Problemas Altos

### H1 — `clearInterval` usado para cancelar `setTimeout` [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `OpenCodeChat.svelte:224-243` |
| **Severidade** | Alto |
| **Impacto** | Semanticamente errado; pode falhar em ambientes nao-browser |

**Descricao**: O polling usa `setTimeout` recursivo, mas `stopPolling` chama `clearInterval`:

```js
function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);  // ← devia ser clearTimeout
      pollTimer = null;
    }
}
function scheduleNextPoll() {
    stopPolling();
    pollTimer = setTimeout(() => { ... }, computePollInterval());  // ← setTimeout
}
```

**Correcao**: Trocar `clearInterval` por `clearTimeout`.

---

### H2 — `formatStatus` le state reativo como free variables (funcao impura) [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `OpenCodeChat.svelte:115-121` |
| **Severidade** | Alto |
| **Impacto** | Status incorreto quando chamado fora do contexto reativo |

**Descricao**: A funcao le `loading`, `sending`, `error` do escopo do modulo sem recebe-los como parametro:

```js
function formatStatus(status, sessionId) {
    if (loading) return '...';       // le $state('loading')
    if (sending || ...) return '...'; // le $state('sending')
    if (error) return 'Erro';        // le $state('error')
    return 'Pronto';
}
```

E chamada em `initializeWorkspace` (via `finally`), `refreshStatus`, e no template — com timings reativos diferentes.

**Correcao**: Passar `loading`, `sending`, `error` como parametros explicitos.

---

### H3 — HTTP 200 com body de erro passa silenciosamente [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `src-tauri/src/lib.rs:699-734` |
| **Severidade** | Alto |
| **Impacto** | Respostas `{ error: "session not found" }` sao tratadas como sucesso |

**Descricao**: `error_for_status()` so verifica HTTP status codes (4xx/5xx). Se o servidor OpenCode retornar 200 com `{ "error": "..." }`, o erro passa como resposta valida. O TypeScript entao tenta extrair `.data` de um objeto de erro.

**Correcao**: Inspecionar o body por campos de erro apos `error_for_status()`.

---

### H4 — `search_project_dirs` bloqueia em diretorios grandes [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `src-tauri/src/lib.rs:276-335` |
| **Severidade** | Alto |
| **Impacto** | UI congela ao buscar em Desktop/Documents com muitos arquivos |

**Descricao**: A busca enumera TODAS as subpastas de cada root (Desktop, Documents, OneDrive) sem early termination. O `limit` so trunca o resultado final — nao interrompe a enumeracao.

**Correcao**: Adicionar early break quando `results.len() >= limit * 2`, ou limitar entradas por root.

---

### H5 — Sem navegacao por teclado na lista de projetos [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `OpenCodeLauncher.svelte:184-207` |
| **Severidade** | Alto |
| **Impacto** | Usuarios de teclado e leitores de tela nao conseguem usar o launcher |

**Descricao**: A lista de projetos tem botoes focaveis, mas nao ha Arrow Up/Down, roving tabindex, nem `aria-activedescendant`. Pior: o Enter no input de busca dispara `startOpenCode`, nao seleciona o item focado.

**Correcao**: Implementar roving tabindex com Arrow keys, e separar Enter no input vs Enter no botao.

---

### H6 — `strayMessages` cresce sem limite [ALTO]

| Campo | Valor |
|---|---|
| **Arquivo** | `OpenCodeChat.svelte:45,171,220` |
| **Severidade** | Alto |
| **Impacto** | Polling fica preso em 500ms permanentemente apos sessoes longas |

**Descricao**: `strayMessages` e incrementado a cada nova mensagem, mas so e zerado em eventos explicitos (tab switch, abort, new session). Se uma sessao produz muitas mensagens, o contador cresce indefinidamente e `computePollInterval()` retorna 500ms para sempre.

**Correcao**: Resetar `strayMessages` quando `isBusyStatus` retorna `false` (sessao idle).

---

## 3. Problemas Medios

### M1 — `loadOpencodeRecents` suprime todos os erros silenciosamente
**Arquivo**: `opencode.ts:65-72` — `catch { return []; }` sem log. Dados corrompidos no localStorage sao perdidos sem aviso.

### M2 — `destroyServer` suprime erros silenciosamente
**Arquivo**: `OpenCodeChat.svelte:370-377` — `catch { }` vazio. Falha ao matar servidor e invisivel.

### M3 — Caminho canonico do `validateProjectDirectory` e descartado
**Arquivo**: `OpenCodeLauncher.svelte:101-108` — A funcao retorna o path canonico (resolvido), mas o codigo usa `selectedPath` original. Dois paths diferentes para a mesma pasta viram entradas duplicadas nos recentes.

### M4 — `handleSessionEnd` e `handleSessionError` sao `async` sem `await`
**Arquivo**: `OpenCodePanel.svelte:19-30` — Funcoes marcadas `async` mas puramente sincronas. Adiciona microtask overhead desnecessario.

### M5 — `strayMessages` incrementa mesmo se `refreshMessages` falhar parcialmente
**Arquivo**: `OpenCodeChat.svelte:165-173` — Se API retorna `null`, `|| []` evita o incremento. Mas se retorna array vazio por falha silenciosa, a logica e correta mas nao documentada.

### M6 — `aria-live="polite"` muito ruidoso durante polling frequente
**Arquivo**: `OpenCodeChat.svelte:442` — O atributo `aria-live` reanuncia TODAS as mensagens a cada poll (500-2000ms), sobrecarregando leitores de tela.

### M7 — `unwrapList` retorna `[]` para formatos inesperados
**Arquivo**: `opencode.ts:141-143` — Se API retornar `{ sessions: [...] }` ou `{ error: "..." }`, retorna array vazio indistinguivel de "sem resultados".

### M8 — `aria-describedby` ausente no composer (sem hint do atalho Ctrl+Enter)
**Arquivo**: `OpenCodeChat.svelte:473-482` — Usuario nao sabe que Ctrl+Enter envia o prompt.

### M9 — Botoes "Parar" e "Enviar" compartilham `flex: 1` sem diferenciacao
**Arquivo**: `tasks.css:687-690` — Em resolucoes intermediarias, o botao "Parar" fica visualmente tao proeminente quanto "Enviar".

### M10 — `border-radius: 0` inconsistente com o resto do app
**Arquivo**: `tasks.css` (diversas linhas) — Elementos OpenCode tem bordas retas, enquanto `.task-input` usa `var(--radius-lg)`. Mismatch visual entre paineis.

---

## 4. Problemas Baixos

| ID | Arquivo | Linha | Descricao |
|---|---|---|---|
| L1 | `opencode.ts` | 1 | Import `tauri.js` mas arquivo e `tauri.ts` — convencao nao-portavel |
| L2 | `opencode.ts` | 75-85 | Dedup case-sensitive em paths Windows (`C:\Proj` vs `c:\proj`) |
| L3 | `opencode.ts` | 103-107 | `folderLabel` edge case para paths raiz (`C:\`) |
| L4 | `OpenCodeLauncher.svelte` | 176-209 | Sem indicador de busca em progresso se ja ha resultados |
| L5 | `OpenCodeChat.svelte` | 462-465 | `<details>` sem `aria-label` |
| L6 | `OpenCodeChat.svelte` | 63-65 | `messageKey` depende de `index` do `#each` para unicidade |
| L7 | `OpenCodeLauncher.svelte` | 127-142 | `$effect` re-dispara se `active` oscilar (toggle acidental) |
| L8 | `OpenCodeLauncher.svelte` | 28,55,144 | `searchRequestId` pode teoricamente overflow |
| L9 | `lib.rs` | 399-431 | `Stdio::null()` no stdout/stderr — sem diagnostico de falha de startup |
| L10 | `lib.rs` | 338-346 | `args` sempre vazio no `OpencodeCommand` |

---

## 5. Tabela Resumo

| Severidade | Quantidade | IDs |
|---|---|---|
| Critico | 4 | C1, C2, C3, C4 |
| Alto | 6 | H1, H2, H3, H4, H5, H6 |
| Medio | 10 | M1–M10 |
| Baixo | 10 | L1–L10 |

---

## 6. Plano de Correcao Priorizado

### Bloqueantes (corrigir antes de uso em producao)

```
1. C1: Segurar mutex durante toda a sequencia de startup
2. C2: Adicionar flag destroying para bloquear initializeWorkspace
3. C3: Adicionar type guards / warnings para respostas inesperadas da API
4. C4: Mover try_wait para fora do lock, usar try_lock com fallback
```

### Altas (corrigir no proximo ciclo)

```
5. H1: clearInterval → clearTimeout
6. H2: Passar state como parametros em formatStatus
7. H3: Validar body por campos de erro apos HTTP 200
8. H4: Early break no search_project_dirs
9. H5: Arrow key navigation no project list
10. H6: Resetar strayMessages quando isBusyStatus = false
```

### Medias (corrigir antes do release)

```
11. M1: console.warn em loadOpencodeRecents
12. M2: console.warn em destroyServer
13. M3: Usar retorno de validateProjectDirectory
14. M4: Remover async desnecessario
15. M7: Logar warning em unwrapList para shapes inesperados
16. M8: Adicionar aria-describedby com hint de Ctrl+Enter
17. M9: Diferenciar largura dos botoes Parar/Enviar
```

### Baixas (melhoria continua)

```
18-27: L1-L10 conforme tabela acima
```

---

*Fim da auditoria.*
