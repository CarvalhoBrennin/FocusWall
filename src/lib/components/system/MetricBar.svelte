<script>
  const {
    label,
    percent = 0,
    detail = '',
    warnAt = 90
  } = $props();

  const clamped = $derived(Math.max(0, Math.min(100, percent)));
  const isWarn = $derived(clamped >= warnAt);
</script>

<div class="metric-bar" class:is-warn={isWarn}>
  <div class="metric-bar-head">
    <span class="metric-bar-label">{label}</span>
    <span class="metric-bar-value">{Math.round(clamped)}%</span>
  </div>
  <div class="metric-bar-track" role="progressbar" aria-valuenow={clamped} aria-valuemin="0" aria-valuemax="100">
    <span class="metric-bar-fill" style:width="{clamped}%"></span>
  </div>
  {#if detail}
    <p class="metric-bar-detail" title={detail}>{detail}</p>
  {/if}
</div>

<style>
  .metric-bar {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .metric-bar-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .metric-bar-label {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--light-soft);
  }

  .metric-bar-value {
    font-size: 0.88rem;
    font-weight: 800;
    color: var(--light-strong);
  }

  .metric-bar.is-warn .metric-bar-value {
    color: var(--danger, #c45c5c);
  }

  .metric-bar-track {
    height: 0.55rem;
    border: 1px solid var(--control-border);
    background: var(--control-bg);
    overflow: hidden;
  }

  .metric-bar-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--accent-olive), var(--accent));
    transition: width 0.35s ease;
  }

  .metric-bar.is-warn .metric-bar-fill {
    background: linear-gradient(90deg, var(--danger, #8b4545), var(--danger, #c45c5c));
  }

  .metric-bar-detail {
    margin: 0;
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--light-soft);
  }
</style>
