<script>
  import TaskItem from './TaskItem.svelte';
  import EmptyState from './EmptyState.svelte';
  import { visibleTasks, lastAddedTaskId, currentDateKey, viewOffsetDays } from '../stores/app-store.js';
  import { CONFIG } from '../config.js';
  import { getTaskPageMeta } from '../utils/task-list.js';

  let currentPage = $state(0);
  const perPage = CONFIG.TASKS_PER_PAGE;

  $effect(() => {
    $currentDateKey;
    $viewOffsetDays;
    currentPage = 0;
  });

  const allTasks = $derived($visibleTasks || []);
  const pageMeta = $derived(getTaskPageMeta(allTasks, perPage, currentPage));

  function goPrev() {
    currentPage = Math.max(0, currentPage - 1);
  }
  function goNext() {
    currentPage = Math.min(pageMeta.totalPages - 1, currentPage + 1);
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
      {#each pageMeta.paginatedTasks as task, i (task.id)}
        {@const globalIndex = pageMeta.page * perPage + i}
        <TaskItem
          {task}
          index={globalIndex}
          tasks={allTasks}
          isNew={$lastAddedTaskId === task.id}
        />
      {/each}
    </ul>

    {#if pageMeta.totalPages > 1}
      <nav class="task-pagination" aria-label="Navegação entre páginas">
        <div class="pagination-meta">
          <span class="pagination-kicker">Mostrando</span>
          <span class="pagination-range" aria-live="off">
            {pageMeta.start}-{pageMeta.end} de {allTasks.length}
          </span>
        </div>
        <div class="pagination-controls">
          <button
            type="button"
            class="pagination-btn"
            aria-label="Página anterior"
            disabled={pageMeta.page <= 0}
            onclick={goPrev}
          >
            ‹
          </button>
          <span class="pagination-label">
            {pageMeta.page + 1} / {pageMeta.totalPages}
          </span>
          <button
            type="button"
            class="pagination-btn"
            aria-label="Próxima página"
            disabled={pageMeta.page >= pageMeta.totalPages - 1}
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
