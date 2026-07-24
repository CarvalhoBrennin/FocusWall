<script>
  import { t } from '../../i18n/index.js';

  let {
    status = 'checking',
    online = false,
    model = '',
    models = [],
    modelAvailable = false,
    messageCount = 0,
    disabled = false,
    onModelChange = () => {},
    onRefresh = () => {},
    onClear = () => {}
  } = $props();

  function statusKey(value) {
    if (value === 'offline') return 'assistant.status.offline';
    if (value === 'starting') return 'assistant.status.starting';
    if (value === 'ready') return 'assistant.status.ready';
    if (value === 'thinking') return 'assistant.status.thinking';
    if (value === 'executing') return 'assistant.status.executing';
    if (value === 'awaiting_confirmation') return 'assistant.status.awaitingConfirmation';
    if (value === 'error') return 'assistant.status.error';
    return online ? 'assistant.status.online' : 'assistant.status.checking';
  }
</script>

<header class="assistant-status-bar">
  <div class="assistant-status-main">
    <span
      class="assistant-status-dot"
      class:is-online={online}
      class:is-busy={status === 'thinking' || status === 'executing'}
      aria-hidden="true"
    ></span>
    <div>
      <strong>{$t(statusKey(status))}</strong>
      {#if online && models.length}
        <label class="assistant-model-picker">
          <span class="sr-only">{$t('assistant.model')}</span>
          <select
            aria-label={$t('assistant.model')}
            value={model}
            disabled={disabled}
            onchange={(event) => onModelChange(event.currentTarget.value)}
          >
            {#each models as entry (entry.name)}
              <option value={entry.name}>{entry.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <span class:model-missing={online && !modelAvailable}>{$t('assistant.model')}: {model}</span>
      {/if}
    </div>
  </div>

  <div class="assistant-status-actions">
    <button class="ghost-button" type="button" disabled={disabled} onclick={onRefresh}>
      {$t('assistant.refresh')}
    </button>
    <button class="ghost-button" type="button" disabled={disabled || messageCount === 0} onclick={onClear}>
      {$t('assistant.clearChat')}
    </button>
  </div>
</header>
