<script>
  import TaskItem from './TaskItem.svelte';
  import EmptyState from './EmptyState.svelte';
  import { visibleTasks, processedVisibleTasks, taskSort, lastAddedTaskId, currentDateKey, viewOffsetDays } from '../stores/app-store.js';
  import { CONFIG } from '../config.js';

  let currentPage = $state(0);
  const perPage = CONFIG.TASKS_PER_PAGE;

  $effect(() => {
    $currentDateKey;
    $viewOffsetDays;
    currentPage = 0;
  });

  const rawTasks = $derived($visibleTasks || []);
  const allTasks = $derived($processedVisibleTasks || []);
  const totalPages = $derived(Math.max(1, Math.ceil(allTasks.length / perPage)));
  const page = $derived(Math.min(currentPage, Math.max(0, totalPages - 1)));
  const paginatedTasks = $derived(allTasks.slice(page * perPage, (page + 1) * perPage));
  const pageStart = $derived(allTasks.length ? page * perPage + 1 : 0);
  const pageEnd = $derived(Math.min((page + 1) * perPage, allTasks.length));

  function goPrev() {
    currentPage = Math.max(0, currentPage - 1);
  }
  function goNext() {
    currentPage = Math.min(totalPages - 1, currentPage + 1);
  }
</script>

<section class="task-list-wrap" aria-live="polite" aria-label="Área principal de tarefas">
  <div class="task-list-safe-area">
    <ul
      id="task-list"
      class="task-list"
      style={`--tasks-per-page: ${perPage};`}
      aria-label="Lista de tarefas do dia"
    >
      {#each paginatedTasks as task, i (task.id)}
        {@const globalIndex = page * perPage + i}
        <TaskItem
          {task}
          index={rawTasks.findIndex((t) => t.id === task.id)}
          tasks={rawTasks}
          canReorder={$taskSort === 'manual'}
          isNew={$lastAddedTaskId === task.id}
        />
      {/each}
    </ul>

    {#if totalPages > 1}
      <nav class="task-pagination" aria-label="Navegação entre páginas">
        <div class="pagination-meta">
          <span class="pagination-kicker">Mostrando</span>
          <span class="pagination-range" aria-live="off">
            {pageStart}-{pageEnd} de {allTasks.length}
          </span>
        </div>
        <div class="pagination-controls">
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
        </div>
      </nav>
    {/if}
  </div>

  <EmptyState hidden={allTasks.length > 0} />
</section>
