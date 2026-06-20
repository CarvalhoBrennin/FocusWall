<script>
  import { get } from 'svelte/store';
  import {
    editingTaskId,
    toggleTask,
    cycleTaskPriority,
    moveTask,
    commitTaskEdit,
    deleteTask
  } from '../stores/app-store.js';
  import { showToast } from '../stores/ui-store.js';
  import { CONFIG, PRIORITY } from '../config.js';
  import { t } from '../i18n/index.js';
  import TaskIcons from './icons/TaskIcons.svelte';

  export let task;
  export let index;
  export let tasks;
  export let isNew = false;

  let editValue = task.text;

  $: isEditing = $editingTaskId === task.id;
  $: if (task?.text != null && !isEditing) editValue = task.text;
  $: canMoveUp = index > 0;
  $: canMoveDown = index < tasks.length - 1;

  function startEditing() {
    editingTaskId.set(task.id);
    editValue = task.text;
  }

  function handleCommit() {
    commitTaskEdit(task.id, editValue);
  }

  function handleEditFocusOut() {
    const id = task.id;
    const value = editValue;
    setTimeout(() => {
      if (get(editingTaskId) === id) {
        commitTaskEdit(id, value);
      }
    }, 0);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingTaskId.set(null);
    }
  }

  function handleDelete() {
    deleteTask(task.id, (undo) => {
      showToast(get(t)('tasks.deleted'), undo);
    });
  }
</script>

<li
  class="task-item"
  class:is-complete={task.completed}
  class:is-new={isNew}
  data-priority={task.priority}
  data-pinned={task.pinned ? 'true' : 'false'}
  data-task-id={task.id}
>
  <button
    type="button"
    class="task-toggle"
    aria-pressed={task.completed}
    aria-label={task.completed ? $t('tasks.markPending') : $t('tasks.markComplete')}
    data-action="toggle"
    data-task-id={task.id}
    onclick={() => toggleTask(task.id)}
  ></button>

  <div class="task-content">
    {#if isEditing}
      <input
        class="task-edit-input"
        type="text"
        maxlength={CONFIG.MAX_TASK_LENGTH}
        aria-label={$t('tasks.edit')}
        data-task-id={task.id}
        bind:value={editValue}
        onkeydown={handleKeydown}
        onfocusout={handleEditFocusOut}
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <p
        class="task-text"
        ondblclick={(e) => { e.stopPropagation(); startEditing(); }}
      >
        {task.text}
      </p>
    {/if}

    <div class="task-meta">
      <button
        type="button"
        class="task-pill"
        class:priority-high={task.priority === 'high'}
        class:priority-medium={task.priority === 'medium'}
        class:priority-low={task.priority === 'low'}
        aria-label={$t('tasks.changePriority')}
        data-action="priority"
        data-task-id={task.id}
        onclick={() => cycleTaskPriority(task.id)}
      >
        {task.priority === PRIORITY.HIGH ? $t('priority.high') : task.priority === PRIORITY.LOW ? $t('priority.low') : $t('priority.medium')}
      </button>

      {#if task.pinned}
        <span class="task-pill task-pill--ghost">{$t('tasks.pinned')}</span>
      {/if}

      <span class="task-state" class:is-complete={task.completed}>
        {task.completed ? $t('tasks.completed') : $t('tasks.open')}
      </span>
    </div>
  </div>

  <div class="task-actions">
    <button
      type="button"
      class="task-action move"
      aria-label={$t('tasks.moveUp')}
      disabled={!canMoveUp}
      data-action="move-up"
      data-task-id={task.id}
      onclick={() => moveTask(task.id, -1)}
    >
      <TaskIcons name="moveUp" />
    </button>
    <button
      type="button"
      class="task-action move"
      aria-label={$t('tasks.moveDown')}
      disabled={!canMoveDown}
      data-action="move-down"
      data-task-id={task.id}
      onclick={() => moveTask(task.id, 1)}
    >
      <TaskIcons name="moveDown" />
    </button>
    <button
      type="button"
      class="task-action delete"
      aria-label={$t('tasks.delete')}
      data-action="delete"
      data-task-id={task.id}
      onclick={handleDelete}
    >
      <TaskIcons name="delete" />
    </button>
  </div>
</li>
