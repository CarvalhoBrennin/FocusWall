<script>
  import { taskSearch, taskFilters, taskSort, availableTags } from '../stores/app-store.js';

  function updateFilter(key, value) {
    taskFilters.update((f) => ({ ...f, [key]: value }));
  }
</script>

<section class="task-tools" aria-label="Busca, filtros e ordenação">
  <input
    class="task-search"
    type="search"
    placeholder="Buscar tarefa, tag ou checklist..."
    bind:value={$taskSearch}
    aria-label="Buscar tarefas"
  />

  <div class="task-tool-grid">
    <label>
      Status
      <select value={$taskFilters.status} on:change={(e) => updateFilter('status', e.currentTarget.value)}>
        <option value="all">Todos</option>
        <option value="open">Em aberto</option>
        <option value="done">Concluídas</option>
      </select>
    </label>

    <label>
      Prioridade
      <select value={$taskFilters.priority} on:change={(e) => updateFilter('priority', e.currentTarget.value)}>
        <option value="all">Todas</option>
        <option value="high">Alta</option>
        <option value="medium">Média</option>
        <option value="low">Baixa</option>
      </select>
    </label>

    <label>
      Tag
      <select value={$taskFilters.tag} on:change={(e) => updateFilter('tag', e.currentTarget.value)}>
        <option value="all">Todas</option>
        {#each $availableTags as tag}
          <option value={tag}>{tag}</option>
        {/each}
      </select>
    </label>

    <label>
      Contexto
      <select value={$taskFilters.scope} on:change={(e) => updateFilter('scope', e.currentTarget.value)}>
        <option value="all">Tudo</option>
        <option value="inbox">Inbox</option>
      </select>
    </label>

    <label>
      Ordenação
      <select value={$taskSort} on:change={(e) => taskSort.set(e.currentTarget.value)}>
        <option value="manual">Manual</option>
        <option value="priority">Prioridade</option>
        <option value="due-asc">Data (mais próxima)</option>
        <option value="updated-desc">Atualização recente</option>
        <option value="created-desc">Criação recente</option>
      </select>
    </label>
  </div>
</section>
