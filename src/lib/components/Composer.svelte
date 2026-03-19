<script>
  import {
    addTask,
    visibleTasks
  } from '../stores/app-store.js';
  import { showToast } from '../stores/ui-store.js';
  import { normalizeTaskText } from '../utils/state.js';
  import { CONFIG, PRIORITY } from '../config.js';

  let taskInput = '';

  $: canAdd = normalizeTaskText(taskInput).length > 0;
  $: tasks = $visibleTasks || [];
  $: done = tasks.filter((t) => t.completed).length;
  $: total = tasks.length;
  $: pct = total ? Math.round((done / total) * 100) : 0;

  function handleAdd() {
    const t = normalizeTaskText(taskInput);
    if (!t) return;
    addTask(t, PRIORITY.MEDIUM).then((id) => {
      if (id) {
        taskInput = '';
        showToast('Tarefa adicionada');
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

<section class="composer-panel" aria-label="Adicionar nova tarefa">
  <div class="composer-copy">
    <p class="eyebrow">Nova entrada</p>
    <h2 class="composer-title">Defina o próximo movimento.</h2>
    <p class="composer-note">Uma tarefa clara, sem fricção.</p>
  </div>

  <div class="composer-shell">
    <div class="composer-entry">
      <label class="sr-only" for="task-input">Nova tarefa</label>
      <input
        id="task-input"
        class="task-input"
        type="text"
        maxlength={CONFIG.MAX_TASK_LENGTH}
        placeholder="Adicionar uma tarefa importante..."
        autocomplete="off"
        inputmode="text"
        bind:value={taskInput}
        on:keydown={handleKeydown}
      />

      <button
        id="add-task"
        class="primary-button"
        type="button"
        disabled={!canAdd}
        on:click={handleAdd}
      >
        Registrar
      </button>
    </div>

    <article class="progress-card progress-summary progress-summary--inline" aria-live="polite">
      <div class="progress-copy">
        <span class="progress-title">Resumo</span>
        <p class="progress-footnote">
          {#if total > 0}
            {pct}% do quadro concluído.
          {:else}
            O dia ainda está em branco.
          {/if}
        </p>
      </div>
      <div class="progress-body">
        <div class="progress-track" aria-hidden="true">
          <span id="progress-bar" class="progress-bar" style="width: {pct}%"></span>
        </div>
        <div class="progress-metrics">
          <span id="progress-label" class="progress-label">{done} de {total} concluídas</span>
          <span class="progress-stat">{total} no quadro</span>
        </div>
      </div>
    </article>
  </div>
</section>
