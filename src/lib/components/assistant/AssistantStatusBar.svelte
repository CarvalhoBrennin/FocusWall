<script>
  import { t } from '../../i18n/index.js';

  let {
    status = 'checking',
    online = false,
    model = '',
    modelAvailable = false,
    messageCount = 0,
    disabled = false,
    onRefresh = () => {},
    onClear = () => {}
  } = $props();

  function statusKey(value) {
    if (value === 'offline') return 'assistant.status.offline';
    if (value === 'ready') return 'assistant.status.ready';
    if (value === 'thinking') return 'assistant.status.thinking';
    if (value === 'executing') return 'assistant.status.executing';
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
      <span class:model-missing={online && !modelAvailable}>{$t('assistant.model')}: {model}</span>
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
