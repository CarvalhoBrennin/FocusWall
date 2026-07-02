<script>
  import '../../../styles/assistant.css';
  import { onDestroy, tick, untrack } from 'svelte';
  import { CONFIG } from '../../config.js';
  import { msg, t } from '../../i18n/index.js';
  import { runAssistantTurn } from '../../services/assistant.js';
  import { checkOllamaHealth, pickAssistantModel } from '../../services/ollama.js';
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

  const model = CONFIG.ASSISTANT.model;
  const activeModel = $derived(pickAssistantModel(health.models, model));
  const modelAvailable = $derived(!health.online || health.models.some((entry) => entry.name === activeModel));

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
    if (sending) return;
    status = 'checking';
    health = await checkOllamaHealth();
    status = health.online ? 'ready' : 'offline';
  }

  function startHealthPolling() {
    stopHealthPolling();
    healthTimer = setInterval(() => {
      if (!active || sending) return;
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

  function appendToken(messageId, chunk) {
    updateMessage(messageId, (message) => ({ ...message, content: message.content + chunk }));
  }

  function resetAssistantContent(messageId) {
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

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || sending) return;

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

      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content.trim() ? message.content : result.content,
        pending: false
      }));
      status = health.online ? 'ready' : 'offline';
    } catch (err) {
      const aborted = (err?.name || '') === 'AbortError';
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
    disabled={sending}
    onRefresh={refreshHealth}
    onClear={clearChat}
  />

  {#if status === 'offline' && !sending}
    <p class="assistant-offline" role="status">
      {$t('assistant.offline')}
      {#if health.error}
        <span class="assistant-offline-detail">{health.error}</span>
      {/if}
    </p>
  {/if}

  <AssistantMessageList {messages} />

  <AssistantComposer
    value={draft}
    disabled={sending || !health.online}
    {sending}
    onInput={(value) => {
      draft = value;
    }}
    onSubmit={sendMessage}
  />
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
