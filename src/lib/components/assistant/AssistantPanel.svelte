<script>
  import '../../../styles/assistant.css';
  import { onDestroy, tick, untrack } from 'svelte';
  import { CONFIG } from '../../config.js';
  import { msg, t } from '../../i18n/index.js';
  import { runAssistantTurn } from '../../services/assistant.js';
  import {
    checkOllamaHealth,
    installOllamaModel,
    pickAssistantModel,
    startOllamaService
  } from '../../services/ollama.js';
  import { showToast } from '../../stores/ui-store.js';
  import AssistantComposer from './AssistantComposer.svelte';
  import AssistantMessageList from './AssistantMessageList.svelte';
  import AssistantStatusBar from './AssistantStatusBar.svelte';

  let { active = false } = $props();

  let messages = $state([]);
  let draft = $state('');
  let status = $state('checking');
  let health = $state({ online: false, models: [] });
  let sending = $state(false);
  let initialized = false;
  let abortController = null;
  let healthTimer = null;
  let tokenFlushFrame = 0;
  const pendingTokenBuffers = new Map();
  let startError = $state('');
  let modelInstallError = $state('');
  let modelInstalling = $state(false);

  const model = CONFIG.ASSISTANT.model;
  const activeModel = $derived(pickAssistantModel(health.models, model));
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

  async function refreshHealth() {
    if (sending || modelInstalling || status === 'starting') return;
    status = 'checking';
    health = await checkOllamaHealth();
    if (health.online) startError = '';
    status = health.online ? 'ready' : 'offline';
  }

  async function startAssistant() {
    if (sending || modelInstalling || status === 'starting') return;
    status = 'starting';
    startError = '';

    const result = await startOllamaService();
    if (result.error) startError = result.error;

    health = await checkOllamaHealth();
    if (health.online) {
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

      health = await checkOllamaHealth();
      if (health.online && health.models.some((entry) => entry.name === activeModel)) {
        modelInstallError = '';
        showToast(result.message || msg('assistant.modelInstallOk'));
      } else if (!modelInstallError) {
        modelInstallError = result.message || msg('assistant.modelInstallFailed');
      }
    } finally {
      modelInstalling = false;
    }
  }

  function startHealthPolling() {
    stopHealthPolling();
    healthTimer = setInterval(() => {
      if (!active || sending || status === 'starting' || status === 'checking') return;
      if (health.online) return;
      refreshHealth();
    }, 8000);
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
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 16);
    tokenFlushFrame = schedule(() => {
      tokenFlushFrame = 0;
      flushPendingTokens();
    });
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
        pendingChoices: result.pendingChoices,
        pending: false
      }));
      status = result.pendingToolCall || result.pendingChoices?.length
        ? 'awaiting_confirmation'
        : health.online ? 'ready' : 'offline';
    } catch (err) {
      const aborted = (err?.name || '') === 'AbortError';
      discardPendingTokens(assistantMessage.id);
      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        content: aborted ? '' : `${msg('assistant.error')} ${String(err?.message || err)}`,
        pending: false,
        error: !aborted
      }));
      status = aborted ? (health.online ? 'ready' : 'offline') : 'error';
    } finally {
      sending = false;
      abortController = null;
    }
  }

  $effect(() => {
    if (!active) {
      stopHealthPolling();
      return;
    }

    startHealthPolling();

    if (!initialized) {
      initialized = true;
      untrack(() => {
        refreshHealth();
      });
    }
  });

  onDestroy(() => {
    abortController?.abort();
    flushPendingTokens();
    stopHealthPolling();
  });
</script>

<section class="assistant-panel" aria-label={$t('assistant.panelLabel')}>
  <AssistantStatusBar
    {status}
    online={health.online}
    model={activeModel}
    {modelAvailable}
    messageCount={messages.length}
    disabled={sending || modelInstalling || status === 'starting'}
    onRefresh={refreshHealth}
    onClear={clearChat}
  />

  {#if showStartScreen}
    <div class="assistant-start-screen" role="status" aria-live="polite">
      <div class="assistant-start-card">
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
        <span class="assistant-start-eyebrow">{$t('assistant.modelMissingEyebrow')}</span>
        <h2>{$t('assistant.modelMissingTitle')}</h2>
        <p>{$t('assistant.modelMissingBody')}</p>
        <span class="assistant-start-detail">{$t('assistant.modelMissingDetail')}: {activeModel}</span>
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
