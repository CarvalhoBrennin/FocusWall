<script>
  export let hidden = false;

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
  tabindex="0"
  aria-label="Adicionar primeira tarefa"
  on:click={handleClick}
  on:keydown={handleKeydown}
>
  <div>
    <p class="empty-title">Quadro aberto.</p>
    <p class="empty-copy">
      Clique aqui ou registre a primeira ação para transformar esta superfície em um plano real.
    </p>
  </div>
</div>
