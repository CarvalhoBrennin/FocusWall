<script>
  import { onDestroy, tick } from 'svelte';
  import { t } from '../../i18n/index.js';

  let { messages = [], disabled = false, onQuickReply = () => {} } = $props();

  function isLastMessage(index) {
    return index === messages.length - 1;
  }

  function showQuickReplies(message, index) {
    return (
      message.role === 'assistant' &&
      !message.pending &&
      isLastMessage(index) &&
      (Boolean(message.pendingPlan) || Boolean(message.pendingToolCall) || Boolean(message.pendingChoices?.length))
    );
  }
  let listEl = $state(null);
  let thinkingIndex = $state(0);
  let thinkingTimer = null;
  const thinkingPhraseKeys = [
    'assistant.thinking.claudering',
    'assistant.thinking.processing',
    'assistant.thinking.context',
    'assistant.thinking.focusWall',
    'assistant.thinking.preparing'
  ];

  function roleLabel(role) {
    return role === 'user' ? $t('assistant.you') : $t('assistant.name');
  }

  function thinkingText() {
    return $t(thinkingPhraseKeys[thinkingIndex]);
  }

  function stopThinkingTimer() {
    if (!thinkingTimer) return;
    clearInterval(thinkingTimer);
    thinkingTimer = null;
  }

  $effect(() => {
    messages.map((message) => `${message.id}:${message.content.length}:${message.actions?.length || 0}`).join('|');
    tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  $effect(() => {
    const hasPendingMessage = messages.some((message) => message.pending);
    if (!hasPendingMessage) {
      stopThinkingTimer();
      thinkingIndex = 0;
      return;
    }
    if (thinkingTimer) return;
    thinkingTimer = setInterval(() => {
      thinkingIndex = (thinkingIndex + 1) % thinkingPhraseKeys.length;
    }, 1450);
  });

  onDestroy(() => {
    stopThinkingTimer();
  });
</script>

<div
  class="assistant-message-list"
  bind:this={listEl}
  aria-live="polite"
  aria-atomic="false"
  aria-relevant="additions text"
>
  {#if messages.length === 0}
    <p class="assistant-empty">{$t('assistant.empty')}</p>
  {:else}
    {#each messages as message, index (message.id)}
      <article
        class={`assistant-message assistant-message--${message.role}`}
        class:is-error={message.error}
        class:is-pending={message.pending}
      >
        <header>
          <strong>{roleLabel(message.role)}</strong>
          {#if message.pending}
            <span>{thinkingText()}</span>
          {/if}
        </header>

        {#if message.content.trim()}
          <pre>{message.content}</pre>
        {:else if message.pending}
          <div class="assistant-thinking-line" aria-label={$t('assistant.status.thinking')}>
            <span class="assistant-thinking-glow" aria-hidden="true"></span>
            <span class="assistant-thinking-text">{thinkingText()}</span>
            <span class="assistant-thinking-dots" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
            </span>
          </div>
        {/if}

        {#if message.actions?.length}
          <div class="assistant-action-list" aria-label={$t('assistant.status.executing')}>
            {#each message.actions as action (action.id)}
              <span class="assistant-action-chip" class:is-failed={!action.ok}>
                <strong>{action.ok ? $t('assistant.actionDone') : $t('assistant.actionFailed')}</strong>
                {action.tool} · {action.label}
              </span>
            {/each}
          </div>
        {/if}

        {#if showQuickReplies(message, index)}
          <div class="assistant-quick-replies" role="group" aria-label={$t('assistant.status.awaitingConfirmation')}>
            {#if message.pendingPlan || message.pendingToolCall}
              <button class="primary-button" type="button" disabled={disabled} onclick={() => onQuickReply('sim')}>
                {$t('assistant.confirmYes')}
              </button>
              <button class="ghost-button" type="button" disabled={disabled} onclick={() => onQuickReply('não')}>
                {$t('assistant.confirmNo')}
              </button>
            {:else}
              {#each message.pendingChoices as choice, choiceIndex (choice.label)}
                <button class="ghost-button" type="button" disabled={disabled} onclick={() => onQuickReply(String(choiceIndex + 1))}>
                  {choiceIndex + 1}. {choice.label}
                </button>
              {/each}
              <button class="ghost-button" type="button" disabled={disabled} onclick={() => onQuickReply('cancela')}>
                {$t('assistant.confirmNo')}
              </button>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  {/if}
</div>
