<script>
  let { active = true } = $props();
</script>

{#if active}
  <div class="media-eq" aria-hidden="true">
    <span class="media-eq-bar"></span>
    <span class="media-eq-bar"></span>
    <span class="media-eq-bar"></span>
    <span class="media-eq-bar"></span>
    <span class="media-eq-bar"></span>
    <span class="media-eq-bar"></span>
  </div>
{/if}
