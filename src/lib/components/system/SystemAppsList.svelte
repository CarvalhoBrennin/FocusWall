<script>
  const { apps = [] } = $props();

  function formatCpu(value) {
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
  }

  function formatRam(mb) {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return mb < 100 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
  }

  function displayName(app) {
    return app.instanceCount > 1 ? `${app.name} (${app.instanceCount})` : app.name;
  }
</script>

<section class="system-apps" aria-label="Aplicativos em uso">
  <h3 class="system-apps-title">Aplicativos</h3>

  {#if apps.length === 0}
    <p class="system-apps-empty">Nenhum aplicativo em execução no momento.</p>
  {:else}
    <div class="system-apps-table-wrap">
      <table class="system-apps-table">
        <thead>
          <tr>
            <th scope="col">App</th>
            <th scope="col">CPU</th>
            <th scope="col">RAM</th>
          </tr>
        </thead>
        <tbody>
          {#each apps as app (app.exe)}
            <tr>
              <td>
                <span class="system-app-name">{displayName(app)}</span>
                <span class="system-app-exe">{app.exe}</span>
              </td>
              <td>{formatCpu(app.cpuPercent)}</td>
              <td>{formatRam(app.memoryMb)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .system-apps {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    min-height: 0;
  }

  .system-apps-title {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--light-soft);
  }

  .system-apps-empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--control-border);
    color: var(--light-soft);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .system-apps-table-wrap {
    overflow: auto;
    max-height: min(42vh, 420px);
    border: 1px solid var(--control-border-soft);
    scrollbar-width: thin;
    scrollbar-color: var(--control-border) transparent;
  }

  .system-apps-table-wrap::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .system-apps-table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .system-apps-table-wrap::-webkit-scrollbar-thumb {
    background: var(--control-border);
    border-radius: 0;
  }

  .system-apps-table-wrap::-webkit-scrollbar-thumb:hover {
    background: var(--accent-soft, var(--control-border));
  }

  .system-apps-table-wrap::-webkit-scrollbar-corner {
    background: transparent;
  }

  .system-apps-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .system-apps-table th {
    position: sticky;
    top: 0;
    padding: 0.5rem 0.65rem;
    text-align: left;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--light-soft);
    background: var(--panel-bg);
    border-bottom: 1px solid var(--control-border);
  }

  .system-apps-table td {
    padding: 0.55rem 0.65rem;
    border-bottom: 1px solid var(--control-border-soft);
    font-weight: 700;
    color: var(--light-strong);
    vertical-align: top;
  }

  .system-apps-table tbody tr:hover {
    background: var(--glare-faint);
  }

  .system-app-name {
    display: block;
    font-weight: 800;
  }

  .system-app-exe {
    display: block;
    margin-top: 0.1rem;
    font-size: 0.72rem;
    color: var(--light-soft);
    letter-spacing: 0.04em;
  }

  .system-apps-table th:nth-child(2),
  .system-apps-table th:nth-child(3),
  .system-apps-table td:nth-child(2),
  .system-apps-table td:nth-child(3) {
    width: 4.5rem;
    text-align: right;
    white-space: nowrap;
  }


  @media (max-height: 840px) and (min-width: 981px) {
    .system-apps-table-wrap {
      max-height: min(34vh, 320px);
    }

    .system-apps-table th,
    .system-apps-table td {
      padding-block: 0.42rem;
    }
  }
</style>
