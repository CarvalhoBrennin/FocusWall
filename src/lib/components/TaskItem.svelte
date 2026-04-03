<script>
  import { get } from 'svelte/store';
  import {
    editingTaskId,
    toggleTask,
    cycleTaskPriority,
    toggleTaskPin,
    moveTask,
    commitTaskEdit,
    deleteTask,
    updateTaskDetails,
    updateTaskTagsFromInput,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem
  } from '../stores/app-store.js';
  import { showToast } from '../stores/ui-store.js';
  import { getPriorityLabel } from '../utils/state.js';
  import { CONFIG, ICONS } from '../config.js';

  export let task;
  export let index;
  export let tasks;
  export let isNew = false;
  export let canReorder = true;

  let editValue = task.text;
  let editTags = (task.tags || []).join(', ');
  let editDueDate = task.dueDate || '';
  let checklistInput = '';

  $: isEditing = $editingTaskId === task.id;
  $: if (task?.text != null && !isEditing) {
    editValue = task.text;
    editTags = (task.tags || []).join(', ');
    editDueDate = task.dueDate || '';
  }
  $: canMoveUp = index > 0;
  $: canMoveDown = index < tasks.length - 1;

  function startEditing() {
    editingTaskId.set(task.id);
    editValue = task.text;
  }

  function handleCommit() {
    Promise.all([
      commitTaskEdit(task.id, editValue),
      updateTaskTagsFromInput(task.id, editTags),
      updateTaskDetails(task.id, { dueDate: editDueDate || null })
    ]).then(() => showToast('Tarefa editada'));
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
      showToast('Tarefa excluída', () => {
        undo();
        showToast('Tarefa restaurada');
      });
    });
  }

  function handleToggle() {
    toggleTask(task.id).then(() => {
      showToast(task.completed ? 'Tarefa reaberta' : 'Tarefa concluída');
    });
  }

  function handleMove(dir, label) {
    moveTask(task.id, dir).then(() => showToast(`Tarefa movida (${label})`));
  }

  function handleAddChecklist() {
    const next = checklistInput;
    if (!next.trim()) return;
    addChecklistItem(task.id, next).then(() => {
      checklistInput = '';
      showToast('Checklist atualizada');
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
    aria-label={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
    data-action="toggle"
    data-task-id={task.id}
    on:click={handleToggle}
  ></button>

  <div class="task-content">
    <div class="task-meta">
      <button
        type="button"
        class="task-pill"
        class:priority-high={task.priority === 'high'}
        class:priority-medium={task.priority === 'medium'}
        class:priority-low={task.priority === 'low'}
        aria-label="Alterar prioridade"
        data-action="priority"
        data-task-id={task.id}
        on:click={() => cycleTaskPriority(task.id)}
      >
        {getPriorityLabel(task.priority)}
      </button>

      <button type="button" class="task-pill task-pill--ghost" on:click={() => toggleTaskPin(task.id)}>
        {task.pinned ? 'Destaque' : 'Destacar'}
      </button>

      <span class="task-state" class:is-complete={task.completed}>
        {task.completed ? 'Concluída' : 'Em aberto'}
      </span>
      {#if task.dueDate}
        <span class="task-pill task-pill--ghost">Até {task.dueDate}</span>
      {/if}
      {#each task.tags || [] as tag}
        <span class="task-pill task-pill--ghost">#{tag}</span>
      {/each}
    </div>

    {#if isEditing}
      <input
        class="task-edit-input"
        type="text"
        maxlength={CONFIG.MAX_TASK_LENGTH}
        aria-label="Editar tarefa"
        data-task-id={task.id}
        bind:value={editValue}
        on:keydown={handleKeydown}
        on:focusout={handleEditFocusOut}
      />
      <div class="task-edit-grid">
        <input class="task-edit-input" type="text" placeholder="tags: foco, casa" bind:value={editTags} />
        <input class="task-edit-input" type="date" bind:value={editDueDate} />
      </div>
    {:else}
      <p class="task-text">{task.text}</p>
    {/if}

    {#if task.checklist?.length}
      <ul class="checklist">
        {#each task.checklist as item (item.id)}
          <li>
            <button type="button" class="task-toggle" aria-label="Alternar subitem" on:click={() => toggleChecklistItem(task.id, item.id)}></button>
            <span class:is-complete={item.done}>{item.text}</span>
            <button type="button" class="task-action delete" aria-label="Remover subitem" on:click={() => removeChecklistItem(task.id, item.id)}>{@html ICONS.delete}</button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="checklist-add">
      <input class="task-edit-input" type="text" maxlength="80" placeholder="Adicionar checklist..." bind:value={checklistInput} on:keydown={(e) => e.key === 'Enter' && handleAddChecklist()} />
      <button type="button" class="task-action" on:click={handleAddChecklist}>+</button>
    </div>
  </div>

  <div class="task-actions">
    <button
      type="button"
      class="task-action"
      aria-label="Editar tarefa"
      on:click={startEditing}
    >
      {@html ICONS.edit}
    </button>
    <button
      type="button"
      class="task-action move"
      aria-label="Subir tarefa"
      disabled={!canMoveUp || !canReorder}
      data-action="move-up"
      data-task-id={task.id}
      on:click={() => handleMove(-1, 'para cima')}
    >
      {@html ICONS.moveUp}
    </button>
    <button
      type="button"
      class="task-action move"
      aria-label="Descer tarefa"
      disabled={!canMoveDown || !canReorder}
      data-action="move-down"
      data-task-id={task.id}
      on:click={() => handleMove(1, 'para baixo')}
    >
      {@html ICONS.moveDown}
    </button>
    <button
      type="button"
      class="task-action delete"
      aria-label="Excluir tarefa"
      data-action="delete"
      data-task-id={task.id}
      on:click={handleDelete}
    >
      {@html ICONS.delete}
    </button>
  </div>
</li>
