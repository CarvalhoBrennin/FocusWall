<script>
  import { tick } from 'svelte';
  import { t } from '../../i18n/index.js';

  let { messages = [] } = $props();
  let listEl = $state(null);

  function roleLabel(role) {
    return role === 'user' ? $t('assistant.you') : $t('assistant.name');
  }

  $effect(() => {
    messages.map((message) => `${message.id}:${message.content.length}:${message.actions?.length || 0}`).join('|');
    tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
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
    {#each messages as message (message.id)}
      <article
        class={`assistant-message assistant-message--${message.role}`}
        class:is-error={message.error}
        class:is-pending={message.pending}
      >
        <header>
          <strong>{roleLabel(message.role)}</strong>
          {#if message.pending}
            <span>{$t('assistant.status.thinking')}</span>
          {/if}
        </header>

        {#if message.content.trim()}
          <pre>{message.content}</pre>
        {:else if message.pending}
          <span class="assistant-cursor" aria-hidden="true"></span>
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
      </article>
    {/each}
  {/if}
</div>
