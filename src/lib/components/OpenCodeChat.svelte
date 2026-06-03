<script>
  import { onDestroy, tick, untrack } from 'svelte';
  import {
    abortOpenCodeSession,
    createOpenCodeSession,
    getOpenCodeDiff,
    getOpenCodeFileStatus,
    getOpenCodeMessages,
    getOpenCodeSessionStatus,
    listOpenCodeSessions,
    sendOpenCodePrompt,
    startOpenCodeServer,
    stopOpenCodeServer
  } from '../services/opencode.js';

  /** @type {{ active?: boolean, workdir?: string, onSessionEnd?: () => void, onSessionError?: (message: string) => void }} */
  let {
    active = false,
    workdir = '',
    onSessionEnd = () => {},
    onSessionError = () => {}
  } = $props();

  let serverInfo = $state(null);
  let sessions = $state([]);
  let selectedSessionId = $state('');
  let messages = $state([]);
  let promptText = $state('');
  let loading = $state(false);
  let sending = $state(false);
  let stopping = $state(false);
  let refreshingDiff = $state(false);
  let error = $state('');
  let statusText = $state('Conectando');
  let apiStatus = $state(null);
  let fileStatus = $state(null);
  let diffData = $state(null);
  let changedFiles = $derived(summarizeFileStatus(fileStatus));
  let diffText = $derived(summarizeDiff(diffData));
  let initializedPath = '';
  let lastSessionId = '';
  let stoppingServer = false;
  let restartAfterStop = false;
  let messageList = null;

  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null;
  let runId = 0;
  let strayMessages = 0;

  function getSessionId(session) {
    return session?.id || session?.sessionID || session?.info?.id || '';
  }

  function getSessionTitle(session) {
    return session?.title || session?.name || `Sessao ${getSessionId(session).slice(0, 8)}`;
  }

  function getMessageId(message) {
    return message?.info?.id || message?.id || '';
  }

  function getMessageRole(message) {
    return message?.info?.role || message?.role || 'assistant';
  }

  function messageKey(message, index) {
    return getMessageId(message) || `${index}-${getMessageRole(message)}`;
  }

  function roleLabel(role) {
    if (role === 'user') return 'Voce';
    if (role === 'assistant') return 'OpenCode';
    if (role === 'system') return 'Sistema';
    return role || 'Mensagem';
  }

  function messageParts(message) {
    if (Array.isArray(message?.parts) && message.parts.length > 0) {
      return message.parts;
    }
    if (typeof message?.text === 'string') {
      return [{ type: 'text', text: message.text }];
    }
    return [];
  }

  function partText(part) {
    if (typeof part?.text === 'string') return part.text;
    if (typeof part?.content === 'string') return part.content;
    return JSON.stringify(part, null, 2);
  }

  function cleanAssistantText(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const firstContentIndex = lines.findIndex((line) => line.trim());
    if (firstContentIndex === -1) return text;

    const first = lines[firstContentIndex].trim();
    const looksLikeReasoning =
      /^(the user|user just|we need|i need|i should|let me|need to|we should)\b/i.test(first) ||
      /\b(i should|i need|let me|we need|we should)\b/i.test(first);

    if (!looksLikeReasoning) return text;

    const remaining = lines.slice(firstContentIndex + 1);
    const answerStart = remaining.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed && !/^(the user|user just|we need|i need|i should|let me|need to|we should)\b/i.test(trimmed);
    });

    if (answerStart === -1) return '';
    return remaining.slice(answerStart).join('\n').trimStart();
  }

  function displayPartText(message, part) {
    const text = partText(part);
    return getMessageRole(message) === 'assistant' ? cleanAssistantText(text) : text;
  }

  function partLabel(part) {
    const type = part?.type || 'parte';
    if (type === 'text') return 'Texto';
    if (type === 'tool') return 'Ferramenta';
    if (type === 'step-start') return 'Etapa';
    if (type === 'step-finish') return 'Etapa concluida';
    return type;
  }

  function visibleMessageParts(message) {
    return messageParts(message).filter((part) => {
      const type = part?.type || 'text';
      return type === 'text' || part?.text || part?.content;
    });
  }

  function technicalMessageParts(message) {
    return messageParts(message).filter((part) => {
      const type = part?.type || 'parte';
      return type !== 'text' && !part?.text && !part?.content;
    });
  }

  function technicalSummary(parts) {
    if (parts.length === 0) return '';
    const tools = parts.filter((part) => part?.type === 'tool').length;
    const steps = parts.filter((part) => String(part?.type || '').startsWith('step-')).length;
    const other = parts.length - tools - steps;
    return [
      steps ? `${steps} etapa${steps === 1 ? '' : 's'}` : '',
      tools ? `${tools} ferramenta${tools === 1 ? '' : 's'}` : '',
      other ? `${other} evento${other === 1 ? '' : 's'}` : ''
    ].filter(Boolean).join(' · ');
  }

  function isBusyStatus(status, sessionId) {
    const direct = status?.[sessionId] ?? status?.status ?? status?.state ?? status;
    if (typeof direct === 'boolean') return direct;
    if (typeof direct === 'string') {
      return !['idle', 'ready', 'done', 'completed', 'complete', 'stopped'].includes(
        direct.toLowerCase()
      );
    }
    if (direct && typeof direct === 'object') {
      if (typeof direct.busy === 'boolean') return direct.busy;
      if (typeof direct.running === 'boolean') return direct.running;
      if (typeof direct.active === 'boolean') return direct.active;
    }
    return false;
  }

  function formatStatus(status, sessionId, isLoading, isSending, hasError) {
    if (isLoading) return 'Iniciando servidor';
    if (isSending || isBusyStatus(status, sessionId)) return 'Processando';
    if (!sessionId) return 'Sem sessao';
    if (hasError) return 'Erro';
    return 'Pronto';
  }

  function summarizeFileStatus(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.value)) return value.value;
    if (Array.isArray(value.files)) return value.files;
    if (Array.isArray(value.data)) return value.data;
    if (typeof value === 'object') {
      return Object.entries(value).map(([path, state]) => ({ path, state }));
    }
    return [];
  }

  function summarizeDiff(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value?.value === 'string') return value.value;
    if (typeof value?.diff === 'string') return value.diff;
    if (typeof value?.data === 'string') return value.data;
    return JSON.stringify(value, null, 2);
  }

  function showApiError(err, fallback) {
    const message = typeof err === 'string' ? err : err?.message || fallback;
    const authMessage = /auth|provider|model|token|credential|login/i.test(message)
      ? 'OpenCode retornou erro de autenticacao ou provider. Revise sua configuracao do OpenCode.'
      : message;
    error = authMessage;
    return authMessage;
  }

  function isScrolledToBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop <= el.clientHeight + 48;
  }

  async function scrollMessagesToBottom(force = false) {
    await tick();
    if (messageList && (force || isScrolledToBottom(messageList))) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  async function refreshMessages(currentRunId = runId, sessionId = selectedSessionId) {
    if (!sessionId) return;
    const previousCount = messages.length;
    const nextMessages = await getOpenCodeMessages(sessionId) || [];
    if (currentRunId !== runId || sessionId !== selectedSessionId) return;
    messages = nextMessages;
    await scrollMessagesToBottom();
    if (messages.length > previousCount) {
      strayMessages += 1;
    }
  }

  async function refreshStatus(currentRunId = runId, sessionId = selectedSessionId) {
    const nextStatus = await getOpenCodeSessionStatus();
    if (currentRunId !== runId || sessionId !== selectedSessionId) return;
    apiStatus = nextStatus;
    statusText = formatStatus(apiStatus, sessionId, loading, sending, !!error);
    if (!isBusyStatus(apiStatus, sessionId)) {
      sending = false;
      strayMessages = 0;
    } else {
      strayMessages += 1;
    }
  }

  async function refreshFileStatus(currentRunId = runId, path = workdir) {
    if (!path) return;
    const nextFileStatus = await getOpenCodeFileStatus(path);
    if (currentRunId !== runId || path !== workdir) return;
    fileStatus = nextFileStatus;
  }

  async function refreshDiff() {
    if (!selectedSessionId || refreshingDiff) return;
    refreshingDiff = true;
    try {
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => getMessageRole(message) === 'assistant' && getMessageId(message));
      diffData = await getOpenCodeDiff(selectedSessionId, getMessageId(lastAssistant) || null);
    } catch (err) {
      showApiError(err, 'Falha ao buscar diff do OpenCode.');
    } finally {
      refreshingDiff = false;
    }
  }

  async function refreshAll(currentRunId = runId) {
    const sessionId = selectedSessionId;
    const path = workdir;
    const results = await Promise.allSettled([
      refreshMessages(currentRunId, sessionId),
      refreshStatus(currentRunId, sessionId),
      refreshFileStatus(currentRunId, path)
    ]);
    if (currentRunId !== runId) return;
    for (const result of results) {
      if (result.status === 'rejected') {
        showApiError(result.reason, 'Falha ao atualizar sessao do OpenCode.');
      }
    }
  }

  function computePollInterval() {
    if (error) return 5000;
    if (sending || isBusyStatus(apiStatus, selectedSessionId)) return 800;
    if (strayMessages > 3) return 500;
    return 2000;
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleNextPoll() {
    stopPolling();
    if (!active || !selectedSessionId) return;
    const currentRunId = runId;
    pollTimer = setTimeout(async () => {
      await refreshAll(currentRunId);
      if (currentRunId === runId) {
        scheduleNextPoll();
      }
    }, computePollInterval());
  }

  function startPolling() {
    stopPolling();
    scheduleNextPoll();
  }

  async function ensureSession(path, currentRunId) {
    const foundSessions = await listOpenCodeSessions(path);
    if (currentRunId !== runId) return;

    if (foundSessions.length === 0) {
      const created = await createOpenCodeSession(path, 'FocusWall');
      sessions = [created];
      selectedSessionId = getSessionId(created);
      lastSessionId = selectedSessionId;
      return;
    }

    sessions = foundSessions;

    if (lastSessionId) {
      const restored = foundSessions.find(
        (session) => getSessionId(session) === lastSessionId
      );
      if (restored) {
        selectedSessionId = lastSessionId;
        return;
      }
    }

    selectedSessionId = getSessionId(foundSessions[0]);
    lastSessionId = selectedSessionId;
  }

  async function initializeWorkspace(path) {
    const currentRunId = ++runId;
    stopPolling();
    loading = true;
    sending = false;
    error = '';
    statusText = 'Iniciando servidor';
    messages = [];
    diffData = null;
    fileStatus = null;
    strayMessages = 0;

    try {
      serverInfo = await startOpenCodeServer(path);
      if (currentRunId !== runId) {
        await stopOpenCodeServer();
        return;
      }
      await ensureSession(path, currentRunId);
      if (currentRunId !== runId) return;
      await refreshAll(currentRunId);
      startPolling();
    } catch (err) {
      const message = showApiError(err, 'Falha ao iniciar OpenCode.');
      onSessionError(message);
    } finally {
      if (currentRunId === runId) {
        loading = false;
        statusText = formatStatus(apiStatus, selectedSessionId, loading, sending, false);
      }
    }
  }

  async function selectSession(sessionId) {
    if (!sessionId || sessionId === selectedSessionId) return;
    selectedSessionId = sessionId;
    lastSessionId = sessionId;
    sending = false;
    diffData = null;
    strayMessages = 0;
    await refreshAll();
  }

  async function createSession() {
    if (!workdir || loading) return;
    loading = true;
    try {
      const created = await createOpenCodeSession(workdir, 'FocusWall');
      sessions = [created, ...sessions];
      selectedSessionId = getSessionId(created);
      lastSessionId = selectedSessionId;
      diffData = null;
      await refreshAll();
    } catch (err) {
      showApiError(err, 'Falha ao criar sessao no OpenCode.');
    } finally {
      loading = false;
    }
  }

  async function sendPrompt() {
    const text = promptText.trim();
    if (!text || !selectedSessionId || sending) return;

    promptText = '';
    sending = true;
    strayMessages = 0;
    statusText = 'Processando';
    try {
      await sendOpenCodePrompt(selectedSessionId, text);
      await refreshAll();
    } catch (err) {
      sending = false;
      promptText = text;
      showApiError(err, 'Falha ao enviar prompt ao OpenCode.');
    }
  }

  async function abortSession() {
    if (!selectedSessionId || stopping) return;
    stopping = true;
    try {
      await abortOpenCodeSession(selectedSessionId);
      sending = false;
      strayMessages = 0;
      await refreshAll();
    } catch (err) {
      showApiError(err, 'Falha ao parar execucao do OpenCode.');
    } finally {
      stopping = false;
    }
  }

  function handleComposerKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendPrompt();
    }
  }

  function clearSessionState() {
    initializedPath = '';
    serverInfo = null;
    sessions = [];
    selectedSessionId = '';
    messages = [];
    apiStatus = null;
    fileStatus = null;
    diffData = null;
    sending = false;
    loading = false;
    strayMessages = 0;
    statusText = 'Conectando';
  }

  async function destroyServer({ reset = true, restartIfNeeded = false } = {}) {
    if (stoppingServer) return;
    const destroyRunId = ++runId;
    stopPolling();
    stoppingServer = true;
    initializedPath = '';
    if (reset) {
      clearSessionState();
    }
    try {
      await stopOpenCodeServer();
    } catch (err) {
      console.warn('OpenCode: falha ao parar servidor', err);
    } finally {
      if (destroyRunId === runId) {
        stoppingServer = false;
      }
      const shouldRestart = restartIfNeeded || restartAfterStop;
      restartAfterStop = false;
      if (shouldRestart && active && workdir) {
        initializeWorkspace(workdir);
      }
    }
  }

  $effect(() => {
    if (!active || !workdir) {
      untrack(() => {
        if (!stoppingServer && (initializedPath || serverInfo || selectedSessionId || loading)) {
          destroyServer({ reset: true });
        }
      });
      return;
    }

    untrack(() => {
      if (stoppingServer) {
        restartAfterStop = true;
        return;
      }
      if (initializedPath !== workdir) {
        initializedPath = workdir;
        initializeWorkspace(workdir);
      }
    });
  });

  onDestroy(() => {
    destroyServer({ reset: true });
  });
</script>

<section class="opencode-chat" aria-label="Cliente OpenCode">
  <aside class="opencode-chat-sidebar" aria-label="Sessoes OpenCode">
    <div class="opencode-chat-status">
      <span class="opencode-status-label">Status</span>
      <strong>{statusText}</strong>
      <span class="opencode-terminal-line opencode-terminal-line--compact" aria-hidden="true">
        <span>{workdir ? `${workdir}>` : 'C:\\>'}</span>
        <code>opencode</code>
      </span>
      {#if serverInfo?.version}
        <span class="opencode-status-meta">OpenCode {serverInfo.version}</span>
      {/if}
    </div>

    <div class="opencode-session-tools">
      <span>Sessoes</span>
      <button class="ghost-button" type="button" disabled={loading} onclick={createSession}>
        Nova
      </button>
    </div>

    {#if sessions.length === 0}
      <p class="opencode-empty">Nenhuma sessao.</p>
    {:else}
      <ul class="opencode-session-list">
        {#each sessions as session (getSessionId(session))}
          <li>
            <button
              type="button"
              class="opencode-session-item"
              class:is-selected={selectedSessionId === getSessionId(session)}
              onclick={() => selectSession(getSessionId(session))}
            >
              <span>{getSessionTitle(session)}</span>
              <small>{getSessionId(session)}</small>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <div class="opencode-chat-main">
    {#if error}
      <p class="opencode-chat-error" role="alert">{error}</p>
    {/if}

    <div class="opencode-message-list" bind:this={messageList} aria-live="polite" aria-atomic="false" aria-relevant="additions">
      {#if loading && messages.length === 0}
        <p class="opencode-empty">Conectando ao servidor OpenCode...</p>
      {:else if !selectedSessionId}
        <p class="opencode-empty">Sem sessao ativa.</p>
      {:else if messages.length === 0}
        <div class="opencode-console-empty">
          <span>C:\FocusWall&gt;</span>
          <code>Sessao pronta. Digite um prompt e envie com Ctrl+Enter.</code>
        </div>
      {:else}
        {#each messages as message, index (messageKey(message, index))}
          {@const visibleParts = visibleMessageParts(message)}
          {@const technicalParts = technicalMessageParts(message)}
          <article class={`opencode-message opencode-message--${getMessageRole(message)}`}>
            <header>
              <strong>
                {#if getMessageRole(message) === 'user'}
                  <span class="opencode-prompt-prefix">C:\FocusWall&gt;</span>
                {:else}
                  {roleLabel(getMessageRole(message))}
                {/if}
              </strong>
              {#if getMessageId(message)}
                <span>{getMessageId(message).slice(0, 8)}</span>
              {/if}
            </header>
            {#each visibleParts as part, partIndex (`${messageKey(message, index)}-text-${partIndex}`)}
              {@const outputText = displayPartText(message, part)}
              {#if outputText.trim()}
                <pre>{outputText}</pre>
              {/if}
            {/each}
            {#if visibleParts.length === 0 && technicalParts.length === 0}
              <pre class="opencode-muted-output">(sem conteudo)</pre>
            {/if}
            {#if technicalParts.length > 0}
              <details class="opencode-message-detail" aria-label="Eventos tecnicos da mensagem">
                <summary>{technicalSummary(technicalParts)}</summary>
                {#each technicalParts as part, partIndex (`${messageKey(message, index)}-technical-${partIndex}`)}
                  <div class="opencode-technical-part">
                    <span>{partLabel(part)}</span>
                    <pre>{partText(part)}</pre>
                  </div>
                {/each}
              </details>
            {/if}
          </article>
        {/each}
      {/if}
    </div>

    <form class="opencode-composer" onsubmit={(event) => { event.preventDefault(); sendPrompt(); }}>
      <label class="sr-only" for="opencode-prompt">Mensagem para o OpenCode</label>
      <span id="opencode-prompt-hint" class="sr-only">Pressione Ctrl+Enter para enviar</span>
      <textarea
        id="opencode-prompt"
        rows="3"
        placeholder="Peca uma alteracao, analise ou correcao..."
        bind:value={promptText}
        disabled={loading || !selectedSessionId || sending}
        aria-describedby="opencode-prompt-hint"
        onkeydown={handleComposerKeydown}
      ></textarea>
      <div class="opencode-composer-actions">
        <button
          class="ghost-button"
          type="button"
          disabled={!selectedSessionId || (!sending && !isBusyStatus(apiStatus, selectedSessionId)) || stopping}
          onclick={abortSession}
        >
          {stopping ? 'Parando...' : 'Parar'}
        </button>
        <button
          class="primary-button"
          type="submit"
          disabled={!promptText.trim() || !selectedSessionId || sending || loading}
        >
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </form>
  </div>

  <aside class="opencode-chat-inspector" aria-label="Arquivos e diff">
    <div class="opencode-inspector-section">
      <div class="opencode-inspector-header">
        <span>Arquivos</span>
      </div>
      {#if changedFiles.length === 0}
        <p class="opencode-empty">Sem alteracoes.</p>
      {:else}
        <ul class="opencode-file-list">
          {#each changedFiles as file, index (`file-${index}`)}
            <li>
              <span>{file.path || file.file || file.name || 'Arquivo'}</span>
              <small>{file.status || file.state || file.type || 'alterado'}</small>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="opencode-inspector-section opencode-inspector-section--diff">
      <div class="opencode-inspector-header">
        <span>Diff</span>
        <button class="ghost-button" type="button" disabled={!selectedSessionId || refreshingDiff} onclick={refreshDiff}>
          {refreshingDiff ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
      {#if diffText}
        <pre class="opencode-diff-output">{diffText}</pre>
      {:else}
        <p class="opencode-empty">Nenhum diff carregado.</p>
      {/if}
    </div>
  </aside>
</section>
