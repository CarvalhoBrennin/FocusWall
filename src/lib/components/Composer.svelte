<script>
  import { get } from 'svelte/store';
  import {
    addTask,
    visibleTasks
  } from '../stores/app-store.js';
  import { showToast } from '../stores/ui-store.js';
  import { normalizeTaskText } from '../utils/state.js';
  import { CONFIG, PRIORITY } from '../config.js';
  import { t, formatMessage } from '../i18n/index.js';

  let taskInput = '';

  $: canAdd = normalizeTaskText(taskInput).length > 0;
  $: tasks = $visibleTasks || [];
  $: done = tasks.filter((task) => task.completed).length;
  $: total = tasks.length;
  $: pct = total ? Math.round((done / total) * 100) : 0;

  function handleAdd() {
    const text = normalizeTaskText(taskInput);
    if (!text) return;
    addTask(text, PRIORITY.MEDIUM).then((id) => {
      if (id) {
        taskInput = '';
        showToast(get(t)('tasks.added'));
      }
    });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

</script>

<section class="composer-panel" aria-label={$t('composer.inputLabel')}>
  <div class="composer-copy">
    <p class="eyebrow">{$t('composer.newEntry')}</p>
    <h2 class="composer-title">{$t('composer.title')}</h2>
  </div>

  <div class="composer-shell">
    <p class="composer-hint sr-only">{$t('composer.hint')}</p>
    <div class="composer-entry">
      <label class="sr-only" for="task-input">{$t('composer.inputLabel')}</label>
      <input
        id="task-input"
        class="task-input"
        type="text"
        maxlength={CONFIG.MAX_TASK_LENGTH}
        placeholder={$t('composer.placeholder')}
        autocomplete="off"
        inputmode="text"
        aria-describedby="task-progress-summary"
        bind:value={taskInput}
        onkeydown={handleKeydown}
      />

      <button
        id="add-task"
        class="primary-button"
        type="button"
        disabled={!canAdd}
        onclick={handleAdd}
      >
        {$t('composer.submit')}
      </button>
    </div>

    <article id="task-progress-summary" class="progress-card progress-summary progress-summary--inline" aria-live="polite">
      <div class="progress-copy">
        <span class="progress-title">{$t('composer.summary')}</span>
        <p class="progress-footnote">
          {#if total > 0}
            {formatMessage($t('composer.percentDone'), { pct })}
          {:else}
            {$t('composer.blankDay')}
          {/if}
        </p>
      </div>
      <div class="progress-body">
        <div class="progress-track" aria-hidden="true">
          <span id="progress-bar" class="progress-bar" style="width: {pct}%"></span>
        </div>
        <div class="progress-metrics">
          <span id="progress-label" class="progress-label">
            {formatMessage($t('composer.completedCount'), { done, total })}
          </span>
          <span class="progress-stat">
            {formatMessage($t('composer.totalOnBoard'), { total })}
          </span>
        </div>
      </div>
    </article>
  </div>
</section>
