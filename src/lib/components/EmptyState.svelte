<script>
  import { t } from '../i18n/index.js';

  let { hidden = false } = $props();

  function handleClick() {
    if (!hidden) document.getElementById('task-input')?.focus();
  }

  function handleKeydown(e) {
    if (!hidden && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      document.getElementById('task-input')?.focus();
    }
  }
</script>

<div
  class="empty-state"
  class:is-hidden={hidden}
  role="button"
  tabindex={hidden ? -1 : 0}
  aria-hidden={hidden}
  aria-label={$t('tasks.emptyAction')}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <div>
    <p class="empty-title">{$t('tasks.emptyTitle')}</p>
    <p class="empty-copy">{$t('tasks.emptyCopy')}</p>
  </div>
</div>
