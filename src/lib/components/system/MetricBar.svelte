<script>
  let {
    label,
    value,
    percent = null,
    detail = '',
    tone = 'accent'
  } = $props();

  const clamped = $derived(
    percent === null || !Number.isFinite(percent)
      ? null
      : Math.max(0, Math.min(100, percent))
  );
</script>

<article class="metric-card" data-tone={tone}>
  <div class="metric-card-head">
    <span class="metric-card-label">{label}</span>
    <span class="metric-card-signal" aria-hidden="true"></span>
  </div>
  <strong class="metric-card-value">{value}</strong>
  <div
    class="metric-card-track"
    class:is-unavailable={clamped === null}
    role={clamped === null ? undefined : 'progressbar'}
    aria-label={label}
    aria-valuenow={clamped === null ? undefined : Math.round(clamped)}
    aria-valuemin={clamped === null ? undefined : 0}
    aria-valuemax={clamped === null ? undefined : 100}
  >
    {#if clamped !== null}
      <span class="metric-card-fill" style:width={`${clamped}%`}></span>
    {/if}
  </div>
  <p class="metric-card-detail" title={detail}>{detail}</p>
</article>

<style>
  .metric-card {
    --metric-color: var(--accent);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.9rem;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--metric-color) 8%, transparent), transparent 62%),
      var(--panel-bg-soft);
    border-right: 1px solid var(--control-border-soft);
    overflow: hidden;
  }

  .metric-card[data-tone='cool'] { --metric-color: #72a4ad; }
  .metric-card[data-tone='warm'] { --metric-color: #ba8c66; }
  .metric-card[data-tone='violet'] { --metric-color: #9682b8; }
  .metric-card[data-tone='olive'] { --metric-color: var(--accent-olive); }

  .metric-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .metric-card-label {
    font-size: 0.64rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--light-soft);
  }

  .metric-card-signal {
    width: 0.42rem;
    height: 0.42rem;
    background: var(--metric-color);
    box-shadow: 0 0 0.65rem color-mix(in srgb, var(--metric-color) 45%, transparent);
  }

  .metric-card-value {
    font-size: clamp(1.35rem, 2vw, 2rem);
    line-height: 1;
    font-weight: 750;
    letter-spacing: -0.04em;
    color: var(--light-strong);
  }

  .metric-card-track {
    height: 0.25rem;
    background: var(--control-bg);
    overflow: hidden;
  }

  .metric-card-track.is-unavailable {
    background: repeating-linear-gradient(
      90deg,
      var(--control-bg) 0 0.4rem,
      transparent 0.4rem 0.65rem
    );
  }

  .metric-card-fill {
    display: block;
    height: 100%;
    background: var(--metric-color);
    box-shadow: 0 0 0.7rem color-mix(in srgb, var(--metric-color) 45%, transparent);
  }

  .metric-card-detail {
    margin: auto 0 0;
    min-width: 0;
    overflow: hidden;
    color: var(--light-soft);
    font-size: 0.7rem;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
