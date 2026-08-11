<script>
  import '../../../styles/assistant.css';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { CONFIG } from '../../config.js';
  import { msg, t } from '../../i18n/index.js';
  import { data } from '../../stores/app-store.js';
  import { runAssistantTurn } from '../../services/assistant.js';
  import {
    checkOllamaHealth,
    installOllamaModel,
    pickAssistantModel,
    startOllamaService,
    unloadOllamaModel
  } from '../../services/ollama.js';
  import { showToast } from '../../stores/ui-store.js';
  import AssistantComposer from './AssistantComposer.svelte';
  import AssistantMessageList from './AssistantMessageList.svelte';
  import AssistantStatusBar from './AssistantStatusBar.svelte';
  import WallbotMark from '../icons/WallbotMark.svelte';

  let { active = false } = $props();

  let messages = $state([]);
  let draft = $state('');
  let status = $state('checking');
  let health = $state({ online: false, models: [] });
  let sending = $state(false);
  let initialized = false;
  let abortController = null;
  let healthTimer = null;
  let healthAbortController = null;
  let healthRequestId = 0;
  let tokenFlushFrame = 0;
  let tokenFlushUsesAnimationFrame = false;
  const pendingTokenBuffers = new Map();
  let startError = $state('');
  let modelInstallError = $state('');
  let modelInstalling = $state(false);
  const configuredModel = $derived($data.ui?.assistantModel || '');
  const activeModel = $derived(configuredModel || pickAssistantModel(health.models, CONFIG.ASSISTANT.model));
  const modelAvailable = $derived(!health.online || health.models.some((entry) => entry.name === activeModel));
  const showStartScreen = $derived(!health.online && (status === 'offline' || status === 'starting'));
  const showModelMissingScreen = $derived(health.online && !modelAvailable);

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createMessage(role, content, extra = {}) {
    return {
      id: createId(role),
      role,
      content,
      createdAt: new Date().toISOString(),
      ...extra
    };
  }

  function updateMessage(id, updater) {
    messages = messages.map((message) => {
      if (message.id !== id) return message;
      return updater({ ...message, actions: [...(message.actions || [])] });
    });
  }

  function applyHealth(nextHealth) {
    health = nextHealth;
    if (nextHealth.online) startError = '';
  }

  async function refreshHealth() {
    if (sending || modelInstalling || status === 'starting') return;
    const requestId = ++healthRequestId;
    healthAbortController?.abort();
    healthAbortController = new AbortController();
    lastHealthCheckAt = Date.now();
    // A pending confirmation survives a health check: overwriting the status
    // would hide the quick replies the user still has to answer.
    const awaitingConfirmation = status === 'awaiting_confirmation';
    if (!awaitingConfirmation) status = 'checking';
    try {
      const nextHealth = await checkOllamaHealth(healthAbortController.signal);
      if (requestId !== healthRequestId) return;
      applyHealth(nextHealth);
      if (!awaitingConfirmation || !nextHealth.online) {
        status = nextHealth.online ? 'ready' : 'offline';
      }
    } catch (error) {
      if (requestId !== healthRequestId || error?.name === 'AbortError') return;
      applyHealth({ online: false, models: [], error: String(error?.message || error) });
      status = 'offline';
    } finally {
      if (requestId === healthRequestId) healthAbortController = null;
    }
  }

  async function startAssistant() {
    if (sending || modelInstalling || status === 'starting') return;
    status = 'starting';
    startError = '';

    const result = await startOllamaService();
    if (result.error) startError = result.error;

    const nextHealth = await checkOllamaHealth();
    applyHealth(nextHealth);
    if (nextHealth.online) {
      startError = '';
      status = 'ready';
      showToast(result.message || msg('assistant.startOk'));
      return;
    }

    status = 'offline';
    if (!startError) startError = result.message || health.error || '';
  }

  async function installModel() {
    if (modelInstalling || sending || !health.online) return;

    modelInstalling = true;
    modelInstallError = '';

    try {
      const result = await installOllamaModel(activeModel);
      if (result.error) modelInstallError = result.error;

      const nextHealth = await checkOllamaHealth();
      applyHealth(nextHealth);
      if (nextHealth.online && nextHealth.models.some((entry) => entry.name === activeModel)) {
        modelInstallError = '';
        showToast(result.message || msg('assistant.modelInstallOk'));
      } else if (!modelInstallError) {
        modelInstallError = result.message || msg('assistant.modelInstallFailed');
      }
    } finally {
      modelInstalling = false;
    }
  }

  const OFFLINE_POLL_MS = 8000;
  // Also re-check while online, but rarely: otherwise a crashed Ollama only
  // surfaces when the next message fails.
  const ONLINE_POLL_MS = 30000;
  let lastHealthCheckAt = 0;

  function startHealthPolling() {
    stopHealthPolling();
    healthTimer = setInterval(() => {
      if (!active || sending || modelInstalling || status === 'starting' || status === 'checking') return;
      const interval = health.online ? ONLINE_POLL_MS : OFFLINE_POLL_MS;
      if (Date.now() - lastHealthCheckAt < interval) return;
      refreshHealth();
    }, OFFLINE_POLL_MS);
  }

  function stopHealthPolling() {
    if (!healthTimer) return;
    clearInterval(healthTimer);
    healthTimer = null;
  }

  function clearChat() {
    messages = [];
  }

  function flushPendingTokens() {
    const entries = [...pendingTokenBuffers.entries()];
    pendingTokenBuffers.clear();
    for (const [messageId, chunk] of entries) {
      updateMessage(messageId, (message) => ({ ...message, content: message.content + chunk }));
    }
  }

  function scheduleTokenFlush() {
    if (tokenFlushFrame) return;
    tokenFlushUsesAnimationFrame = typeof requestAnimationFrame === 'function';
    const schedule = tokenFlushUsesAnimationFrame
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 16);
    tokenFlushFrame = schedule(() => {
      tokenFlushFrame = 0;
      flushPendingTokens();
    });
  }

  function cancelScheduledTokenFlush() {
    if (!tokenFlushFrame) return;
    if (tokenFlushUsesAnimationFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tokenFlushFrame);
    else clearTimeout(tokenFlushFrame);
    tokenFlushFrame = 0;
  }

  function appendToken(messageId, chunk) {
    pendingTokenBuffers.set(messageId, `${pendingTokenBuffers.get(messageId) || ''}${chunk}`);
    scheduleTokenFlush();
  }

  function discardPendingTokens(messageId) {
    pendingTokenBuffers.delete(messageId);
  }

  function resetAssistantContent(messageId) {
    flushPendingTokens();
    updateMessage(messageId, (message) => ({ ...message, content: '' }));
  }

  function appendAction(messageId, action, result) {
    updateMessage(messageId, (message) => ({
      ...message,
      actions: [...(message.actions || []), action]
    }));
    if (result.ok && result.changed) {
      showToast(result.message);
    }
  }

  function cancelAssistantTurn() {
    abortController?.abort();
  }

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || sending || modelInstalling) return;

    if (!health.online) {
      await refreshHealth();
      if (!health.online) {
        showToast(msg('assistant.offline'));
        return;
      }
    }

    const userMessage = createMessage('user', content);
    const assistantMessage = createMessage('assistant', '', { pending: true, actions: [] });
    const conversation = [...messages, userMessage];
    messages = [...conversation, assistantMessage];
    draft = '';
    sending = true;
    abortController?.abort();
    abortController = new AbortController();

    await tick();
    try {
      const result = await runAssistantTurn(
        conversation,
        {
          onToken: (chunk) => appendToken(assistantMessage.id, chunk),
          onContentReset: () => resetAssistantContent(assistantMessage.id),
          onToolResult: (action, toolResult) => appendAction(assistantMessage.id, action, toolResult),
          onStatus: (nextStatus) => {
            status = nextStatus;
          }
        },
        abortController.signal,
        activeModel
      );

      flushPendingTokens();
      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content.trim() ? message.content : result.content,
        pendingToolCall: result.pendingToolCall,
        pendingPlan: result.pendingPlan,
        pendingChoices: result.pendingChoices,
        limited: Boolean(result.stoppedByLimit),
        pending: false
      }));
      status = result.pendingPlan || result.pendingToolCall || result.pendingChoices?.length
        ? 'awaiting_confirmation'
        : health.online ? 'ready' : 'offline';
    } catch (err) {
      const aborted = (err?.name || '') === 'AbortError';
      discardPendingTokens(assistantMessage.id);
      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        content: aborted ? msg('assistant.cancelled') : `${msg('assistant.error')} ${String(err?.message || err)}`,
        pending: false,
        error: !aborted
      }));
      status = aborted ? (health.online ? 'ready' : 'offline') : 'error';
    } finally {
      sending = false;
      abortController = null;
    }
  }

  /**
   * Primeira ativação da aba: o Ollama sobe aqui, não no boot do app. Quem nunca
   * abre o assistente nunca paga o processo. A ordem importa — checar a saúde
   * primeiro evita spawnar um segundo processo quando o usuário já roda o Ollama
   * como serviço.
   */
  async function bootAssistant() {
    await refreshHealth();
    if (!health.online) await startAssistant();
  }

  $effect(() => {
    if (!active) {
      stopHealthPolling();
      // Sair da aba libera os ~5-6 GB do modelo na hora, em vez de esperar o
      // keep_alive inteiro. Não faz sentido durante um envio: a resposta ainda
      // está sendo gerada.
      //
      // Ler `sending` aqui é intencional e carrega peso: cria dependência, então
      // sair da aba no meio de um envio não descarrega nada, mas o fim do envio
      // reexecuta este efeito e o descarregamento acontece. Sem a dependência, o
      // modelo ficaria residente até a próxima troca de aba.
      if (initialized && !sending) {
        untrack(() => void unloadOllamaModel(activeModel));
      }
      return;
    }

    startHealthPolling();

    if (!initialized) {
      initialized = true;
      untrack(() => {
        void bootAssistant();
      });
    }
  });

  /**
   * O keep_alive configurado é mais longo que o default do Ollama, então fechar o
   * app com a aba do assistente aberta precisa descarregar explicitamente — senão
   * esta mudança pioraria justamente o caso que se propõe a melhorar.
   *
   * `beforeunload` é o gancho confiável para o fechamento da janela; `onDestroy`
   * cobre desmontagem e reload. Os dois podem disparar na mesma saída, e um
   * unload duplicado é inofensivo (o segundo encontra o modelo já descarregado).
   */
  function releaseModel() {
    if (initialized) void unloadOllamaModel(activeModel);
  }

  onMount(() => {
    window.addEventListener('beforeunload', releaseModel);
  });

  onDestroy(() => {
    abortController?.abort();
    healthAbortController?.abort();
    cancelScheduledTokenFlush();
    flushPendingTokens();
    stopHealthPolling();
    window.removeEventListener('beforeunload', releaseModel);
    releaseModel();
  });
</script>

<section class="assistant-panel" aria-label={$t('assistant.panelLabel')}>
  <AssistantStatusBar
    {status}
    online={health.online}
    messageCount={messages.length}
    disabled={sending || modelInstalling || status === 'starting'}
    onRefresh={refreshHealth}
    onClear={clearChat}
  />

  {#if showStartScreen}
    <div class="assistant-start-screen" role="status" aria-live="polite">
      <div class="assistant-start-card">
        <div class="assistant-start-brand">
          <WallbotMark size={44} />
          <span>{$t('assistant.name')}</span>
        </div>
        <span class="assistant-start-eyebrow">{$t('assistant.startEyebrow')}</span>
        <h2>{$t('assistant.startTitle')}</h2>
        <p>{$t('assistant.startBody')}</p>
        {#if startError || health.error}
          <span class="assistant-start-detail">{startError || health.error}</span>
        {/if}
        <div class="assistant-start-actions">
          <button class="primary-button" type="button" disabled={modelInstalling || status === 'starting'} onclick={startAssistant}>
            {status === 'starting' ? $t('assistant.starting') : $t('assistant.startButton')}
          </button>
          <button class="ghost-button" type="button" disabled={modelInstalling || status === 'starting'} onclick={refreshHealth}>
            {$t('assistant.refresh')}
          </button>
        </div>
      </div>
    </div>

  {:else if showModelMissingScreen}
    <div class="assistant-start-screen" role="status" aria-live="polite">
      <div class="assistant-start-card">
        <div class="assistant-start-brand">
          <WallbotMark size={44} />
          <span>{$t('assistant.name')}</span>
        </div>
        <span class="assistant-start-eyebrow">{$t('assistant.modelMissingEyebrow')}</span>
        <h2>{$t('assistant.modelMissingTitle')}</h2>
        <p>{$t('assistant.modelMissingBody')}</p>
        <span class="assistant-start-detail">{$t('assistant.modelMissingDetail')}</span>
        {#if modelInstallError}
          <span class="assistant-start-detail">{modelInstallError}</span>
        {/if}
        <div class="assistant-start-actions">
          <button class="primary-button" type="button" disabled={modelInstalling} onclick={installModel}>
            {modelInstalling ? $t('assistant.modelInstalling') : $t('assistant.modelInstallButton')}
          </button>
          <button class="ghost-button" type="button" disabled={status === 'checking' || modelInstalling} onclick={refreshHealth}>
            {$t('assistant.refresh')}
          </button>
        </div>
      </div>
    </div>
  {:else}
    <AssistantMessageList
      {messages}
      disabled={sending || modelInstalling || !health.online}
      onQuickReply={sendMessage}
    />

    <AssistantComposer
      value={draft}
      disabled={sending || modelInstalling || !health.online || !modelAvailable}
      {sending}
      onInput={(value) => {
        draft = value;
      }}
      onSubmit={sendMessage}
      onCancel={cancelAssistantTurn}
    />
  {/if}
</section>

<style>
  .assistant-panel {
    display: flex !important;
    flex-direction: column !important;
  }

  :global(.assistant-status-bar),
  :global(.assistant-offline),
  :global(.assistant-composer) {
    flex: 0 0 auto !important;
  }

  :global(.assistant-message-list) {
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
</style>
