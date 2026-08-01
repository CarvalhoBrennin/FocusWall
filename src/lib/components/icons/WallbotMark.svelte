<script>
  let { size = 32, title = '', decorative = true } = $props();
</script>

<svg
  class="wallbot-mark"
  width={size}
  height={size}
  viewBox="0 0 48 48"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden={decorative ? 'true' : undefined}
  aria-label={decorative ? undefined : title}
  role={decorative ? undefined : 'img'}
>
  {#if !decorative && title}
    <title>{title}</title>
  {/if}
  <path d="M24 7V11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="24" cy="5" r="2" fill="currentColor" />
  <rect x="8" y="11" width="32" height="27" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.5" />
  <path d="M8 20H40" stroke="currentColor" stroke-width="2.5" />
  <circle cx="18" cy="25" r="2.5" fill="currentColor" />
  <circle cx="30" cy="25" r="2.5" fill="currentColor" />
  <path d="M17 31C19.08 32.7 21.42 33.5 24 33.5C26.58 33.5 28.92 32.7 31 31" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
  <path d="M4.5 21.5V28.5M43.5 21.5V28.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
</svg>

<style>
  .wallbot-mark {
    display: block;
    flex: 0 0 auto;
    color: var(--accent-strong);
  }
</style>
