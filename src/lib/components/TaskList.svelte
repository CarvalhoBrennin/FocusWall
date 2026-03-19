<script>
  import TaskItem from './TaskItem.svelte';
  import EmptyState from './EmptyState.svelte';
  import { visibleTasks, lastAddedTaskId, currentDateKey, viewOffsetDays } from '../stores/app-store.js';
  import { CONFIG } from '../config.js';

  let currentPage = $state(0);
  const perPage = CONFIG.TASKS_PER_PAGE;

  $effect(() => {
    $currentDateKey;
    $viewOffsetDays;
    currentPage = 0;
  });

  const allTasks = $derived($visibleTasks || []);
  const totalPages = $derived(Math.max(1, Math.ceil(allTasks.length / perPage)));
  const page = $derived(Math.min(currentPage, Math.max(0, totalPages - 1)));
  const paginatedTasks = $derived(allTasks.slice(page * perPage, (page + 1) * perPage));

  function goPrev() {
    currentPage = Math.max(0, currentPage - 1);
  }
  function goNext() {
    currentPage = Math.min(totalPages - 1, currentPage + 1);
  }
</script>

<section class="task-list-wrap" aria-live="polite" aria-label="Área principal de tarefas">
  <ul id="task-list" class="task-list" aria-label="Lista de tarefas do dia">
    {#each paginatedTasks as task, i (task.id)}
      {@const globalIndex = page * perPage + i}
      <TaskItem
        {task}
        index={globalIndex}
        tasks={allTasks}
        isNew={$lastAddedTaskId === task.id}
      />
    {/each}
  </ul>

  {#if totalPages > 1}
    <nav class="task-pagination" aria-label="Navegação entre páginas">
      <button
        type="button"
        class="pagination-btn"
        aria-label="Página anterior"
        disabled={page <= 0}
        onclick={goPrev}
      >
        ‹
      </button>
      <span class="pagination-label">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        class="pagination-btn"
        aria-label="Próxima página"
        disabled={page >= totalPages - 1}
        onclick={goNext}
      >
        ›
      </button>
    </nav>
  {/if}

  <EmptyState hidden={allTasks.length > 0} />
</section>
