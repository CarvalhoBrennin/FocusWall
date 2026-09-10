<script>
  import MonitorSelector from './MonitorSelector.svelte';
  import StartupToggle from './StartupToggle.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import UpdateSettings from './UpdateSettings.svelte';
  import AssistantSettings from './AssistantSettings.svelte';
  import YouTubeMusicSettings from './music/YouTubeMusicSettings.svelte';
  import { settingsModal } from '../stores/ui-store.js';
  import { exportStateBackup } from '../stores/app-store.js';
  import { trapFocus } from '../utils/focus-trap.js';
  import { t } from '../i18n/index.js';

  let overlayEl = $state(null);
  let closeButtonEl = $state(null);
  let activeSection = $state($settingsModal?.section || 'appearance');
  let activeNavItem = $derived(navItems.find((item) => item.id === activeSection) ?? navItems[0]);

  const navItems = [
    { id: 'appearance', labelKey: 'settings.theme', icon: 'sun' },
    { id: 'assistant', labelKey: 'settings.wallbot', icon: 'spark' },
    { id: 'media', labelKey: 'music.settingsTitle', icon: 'play' },
    { id: 'updates', labelKey: 'settings.updates', icon: 'refresh' },
    { id: 'system', labelKey: 'monitor.title', icon: 'monitor' },
    { id: 'startup', labelKey: 'startup.title', icon: 'power' },
    { id: 'data', labelKey: 'settings.data', icon: 'database' }
  ];

  function handleClose() {
    settingsModal.set(null);
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleOverlayKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClose();
    }
  }

  function handleNavClick(id) {
    activeSection = id;
  }

  $effect(() => {
    if (!overlayEl) return;
    return trapFocus(overlayEl, {
      initialFocus: closeButtonEl,
      onEscape: handleClose
    });
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_click_events_have_key_events -->
<div
  bind:this={overlayEl}
  class="settings-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={handleOverlayKeydown}
>
  <div class="settings-modal">
    <header class="settings-header">
      <div class="settings-heading">
        <div class="settings-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h10M18 17h2" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="16" cy="17" r="2" />
          </svg>
        </div>
        <div>
          <p class="settings-overline">{$t('settings.title')}</p>
          <h2 id="settings-title" class="settings-title">{$t(activeNavItem.labelKey)}</h2>
        </div>
      </div>

      <button
        bind:this={closeButtonEl}
        type="button"
        class="settings-close"
        aria-label={$t('settings.close')}
        title={$t('settings.close')}
        onclick={handleClose}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      </button>
    </header>

    <div class="settings-body">
      <aside class="settings-nav">
        <div class="settings-nav-heading">
          <span class="settings-nav-dot" aria-hidden="true"></span>
          <span>{$t('settings.title')}</span>
        </div>
        <nav aria-label={$t('settings.title')}>
          <div class="settings-nav-list">
            {#each navItems as item, index}
              <button
                type="button"
                class:active={activeSection === item.id}
                class="settings-nav-item"
                aria-current={activeSection === item.id ? 'page' : undefined}
                onclick={() => handleNavClick(item.id)}
              >
                <span class="settings-nav-index">{String(index + 1).padStart(2, '0')}</span>
                <span class="settings-nav-icon" aria-hidden="true">
                  {#if item.icon === 'sun'}
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.58 4.58l1.42 1.42M18 18l1.42 1.42M2.5 12h2M19.5 12h2M4.58 19.42 6 18M18 6l1.42-1.42" /></svg>
                  {:else if item.icon === 'spark'}
                    <svg viewBox="0 0 24 24" fill="none"><path d="m12 3 1.55 5.45L19 10l-5.45 1.55L12 17l-1.55-5.45L5 10l5.45-1.55L12 3ZM19 16l.62 2.38L22 19l-2.38.62L19 22l-.62-2.38L16 19l2.38-.62L19 16Z" /></svg>
                  {:else if item.icon === 'play'}
                    <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m10 9 5 3-5 3V9Z" /></svg>
                  {:else if item.icon === 'refresh'}
                    <svg viewBox="0 0 24 24" fill="none"><path d="M20 11a8 8 0 0 0-14.66-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14.66 4L20 15m0 4v-4h-4" /></svg>
                  {:else if item.icon === 'monitor'}
                    <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                  {:else if item.icon === 'power'}
                    <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v8M7.05 5.93a8 8 0 1 0 9.9 0" /></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16v13H4zM8 4h8v3H8zM8 11h8M8 15h5" /></svg>
                  {/if}
                </span>
                <span class="settings-nav-label">{$t(item.labelKey)}</span>
              </button>
            {/each}
          </div>
        </nav>
      </aside>

      <div class="settings-content">
        {#if activeSection === 'appearance'}
          <section class="settings-card settings-card--appearance">
            <div class="settings-card-rail" aria-hidden="true">
              <span>01</span><i></i><span>{$t('settings.theme')}</span>
            </div>
            <AppearanceSettings />
          </section>
        {:else if activeSection === 'assistant'}
          <section class="settings-card settings-card--assistant">
            <div class="settings-card-rail" aria-hidden="true">
              <span>02</span><i></i><span>{$t('settings.wallbot')}</span>
            </div>
            <AssistantSettings />
          </section>
        {:else if activeSection === 'media'}
          <section class="settings-card settings-card--media">
            <div class="settings-card-rail" aria-hidden="true">
              <span>03</span><i></i><span>{$t('music.settingsTitle')}</span>
            </div>
            <YouTubeMusicSettings />
          </section>
        {:else if activeSection === 'updates'}
          <section class="settings-card settings-card--updates">
            <div class="settings-card-rail" aria-hidden="true">
              <span>04</span><i></i><span>{$t('settings.updates')}</span>
            </div>
            <UpdateSettings />
          </section>
        {:else if activeSection === 'system'}
          <section class="settings-card settings-card--system">
            <div class="settings-card-rail" aria-hidden="true">
              <span>05</span><i></i><span>{$t('monitor.title')}</span>
            </div>
            <MonitorSelector />
          </section>
        {:else if activeSection === 'startup'}
          <section class="settings-card settings-card--startup">
            <div class="settings-card-rail" aria-hidden="true">
              <span>06</span><i></i><span>{$t('startup.title')}</span>
            </div>
            <StartupToggle />
          </section>
        {:else if activeSection === 'data'}
          <section class="settings-card settings-card--data">
            <div class="settings-card-rail" aria-hidden="true">
              <span>07</span><i></i><span>{$t('settings.data')}</span>
            </div>
            <div class="settings-backup">
              <div>
                <h3>{$t('settings.data')}</h3>
                <p>{$t('settings.exportBackup')}</p>
              </div>
              <button type="button" class="ghost-button" onclick={exportStateBackup}>
                {$t('settings.exportBackup')}
              </button>
            </div>
          </section>
        {/if}
      </div>
    </div>

    <footer class="settings-footer">
      <span class="settings-footer-state"><span aria-hidden="true"></span>{$t(activeNavItem.labelKey)}</span>
      <button type="button" class="primary-button" onclick={handleClose}>
        {$t('settings.close')}
      </button>
    </footer>
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(0.75rem, 3vw, 2.5rem);
    background: var(--overlay-bg);
    backdrop-filter: blur(12px);
    animation: settingsOverlayIn 180ms ease-out both;
  }

  .settings-modal {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(100%, 940px);
    min-height: min(680px, calc(100dvh - 2rem));
    max-height: min(880px, calc(100dvh - 2rem));
    overflow: hidden;
    isolation: isolate;
    border: 1px solid var(--surface-dark-border);
    border-radius: 22px;
    background: var(--panel-bg);
    box-shadow: var(--shadow-lg), 0 0 0 1px var(--glare-faint);
    animation: settingsModalIn 260ms var(--transition) both;
  }

  .settings-modal::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    content: "";
    background:
      radial-gradient(circle at 100% 0, var(--accent-soft), transparent 31%),
      linear-gradient(140deg, var(--glare-strong), transparent 28%),
      linear-gradient(180deg, var(--glare-faint), transparent 40%);
  }

  .settings-modal::after {
    position: absolute;
    inset: 1px;
    z-index: 2;
    pointer-events: none;
    content: "";
    border: 1px solid var(--control-border-soft);
    border-radius: 21px;
  }

  .settings-header,
  .settings-footer,
  .settings-body {
    position: relative;
    z-index: 3;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.2rem 1.35rem;
    border-bottom: 1px solid var(--divider);
    background: linear-gradient(180deg, var(--glare-soft), transparent);
  }

  .settings-heading {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .settings-mark {
    display: grid;
    width: 2.85rem;
    height: 2.85rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--control-border-strong));
    border-radius: 13px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    box-shadow: inset 0 1px 0 var(--glare-soft);
  }

  .settings-mark svg {
    width: 1.4rem;
    height: 1.4rem;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
  }

  .settings-overline {
    margin: 0 0 0.25rem;
    color: var(--light-soft);
    font-size: 0.61rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .settings-title {
    margin: 0;
    color: var(--light-strong);
    font-size: clamp(1.2rem, 2vw, 1.55rem);
    font-weight: 800;
    letter-spacing: -0.025em;
  }

  .settings-close {
    display: grid;
    width: 2.55rem;
    height: 2.55rem;
    flex: 0 0 auto;
    place-items: center;
    padding: 0;
    border: 1px solid var(--control-border-strong);
    border-radius: 12px;
    background: var(--control-bg);
    color: var(--light-muted);
    transition: transform var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
  }

  .settings-close svg {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 1.8;
  }

  .settings-close:hover {
    transform: translateY(-1px);
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--light-strong);
  }

  .settings-close:focus-visible,
  .settings-nav-item:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .settings-body {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }

  .settings-nav {
    min-width: 0;
    padding: 1.05rem 0.7rem;
    border-right: 1px solid var(--divider);
    background: var(--card-bg-muted);
  }

  .settings-nav-heading {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.8rem 0.55rem;
    color: var(--light-soft);
    font-size: 0.61rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .settings-nav-dot,
  .settings-footer-state span {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 4px var(--success-soft);
  }

  .settings-nav-list {
    display: grid;
    gap: 0.2rem;
  }

  .settings-nav-item {
    display: grid;
    grid-template-columns: 1.3rem 1rem minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 2.4rem;
    gap: 0.45rem;
    padding: 0.5rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--light-muted);
    text-align: left;
    transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }

  .settings-nav-item:hover {
    border-color: var(--control-border-soft);
    background: var(--control-bg);
    color: var(--light-main);
    transform: translateX(1px);
  }

  .settings-nav-item.active {
    border-color: color-mix(in srgb, var(--accent) 32%, var(--control-border-soft));
    background: var(--accent-soft);
    color: var(--light-strong);
  }

  .settings-nav-index {
    color: var(--light-soft);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    letter-spacing: 0.04em;
  }

  .settings-nav-item.active .settings-nav-index {
    color: var(--accent);
  }

  .settings-nav-icon {
    display: inline-flex;
    color: currentColor;
  }

  .settings-nav-icon svg {
    width: 0.92rem;
    height: 0.92rem;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.55;
  }

  .settings-nav-label {
    min-width: 0;
    overflow: hidden;
    font-size: 0.73rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-content {
    display: block;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
    scroll-behavior: smooth;
    scrollbar-color: var(--surface-dark-border) transparent;
    scrollbar-width: thin;
  }

  .settings-content::-webkit-scrollbar {
    width: 7px;
  }

  .settings-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .settings-content::-webkit-scrollbar-thumb {
    border-radius: 99px;
    background: var(--surface-dark-border);
  }

  .settings-card {
    position: relative;
    min-width: 0;
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--control-border-soft);
    border-radius: 15px;
    background: var(--card-bg);
    box-shadow: inset 0 1px 0 var(--glare-soft), var(--shadow-xs);
    scroll-margin-top: 0.8rem;
  }

  .settings-card::before {
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    content: "";
    background: linear-gradient(90deg, var(--accent), transparent 78%);
    opacity: 0.85;
  }

  .settings-card-rail {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.78rem 0.95rem 0;
    color: var(--light-soft);
    font-family: var(--font-mono);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .settings-card-rail i {
    display: block;
    width: 1.6rem;
    height: 1px;
    background: var(--control-border-strong);
  }

  .settings-card-rail span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-card :global(.settings-section),
  .settings-card :global(.assistant-settings),
  .settings-card :global(.youtube-music-settings),
  .settings-card :global(.monitor-selector),
  .settings-card :global(.startup-toggle) {
    padding: 0.75rem 0.95rem 1rem;
  }

  .settings-card :global(.settings-section--appearance),
  .settings-card :global(.settings-section--updates) {
    padding-top: 0.72rem;
  }

  .settings-backup {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.95rem 1rem;
  }

  .settings-backup h3 {
    margin: 0;
    color: var(--light-main);
    font-size: 0.84rem;
  }

  .settings-backup p {
    margin: 0.25rem 0 0;
    color: var(--light-muted);
    font-size: 0.68rem;
  }

  .settings-backup :global(.ghost-button) {
    flex: 0 0 auto;
  }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1.35rem;
    border-top: 1px solid var(--divider);
    background: var(--card-bg-muted);
  }

  .settings-footer-state {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--light-soft);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .settings-footer-state span {
    display: inline-block;
    width: 0.35rem;
    height: 0.35rem;
    box-shadow: 0 0 0 3px var(--success-soft);
  }

  @keyframes settingsOverlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes settingsModalIn {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @media (max-width: 760px) {
    .settings-modal {
      min-height: 0;
      max-height: calc(100dvh - 1.5rem);
    }

    .settings-body {
      display: flex;
      flex-direction: column;
    }

    .settings-nav {
      padding: 0.7rem 0.8rem 0.65rem;
      border-right: 0;
      border-bottom: 1px solid var(--divider);
    }

    .settings-nav-heading {
      display: none;
    }

    .settings-nav-list {
      display: flex;
      gap: 0.35rem;
      overflow-x: auto;
      padding: 0.1rem;
      scrollbar-width: none;
    }

    .settings-nav-list::-webkit-scrollbar {
      display: none;
    }

    .settings-nav-item {
      grid-template-columns: 1rem minmax(max-content, 1fr);
      width: auto;
      min-width: max-content;
      min-height: 2.15rem;
      padding: 0.42rem 0.62rem;
    }

    .settings-nav-index {
      display: none;
    }

    .settings-content {
      padding: 0.8rem;
    }
  }

  @media (max-width: 480px) {
    .settings-overlay {
      padding: 0.45rem;
    }

    .settings-modal {
      max-height: calc(100dvh - 0.9rem);
      border-radius: 17px;
    }

    .settings-modal::after {
      border-radius: 16px;
    }

    .settings-header {
      padding: 0.95rem;
    }

    .settings-mark {
      width: 2.45rem;
      height: 2.45rem;
    }

    .settings-footer {
      padding: 0.75rem 0.95rem;
    }

    .settings-footer :global(.primary-button) {
      min-width: 7rem;
    }

    .settings-backup {
      align-items: stretch;
      flex-direction: column;
    }

    .settings-backup :global(.ghost-button) {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-overlay,
    .settings-modal {
      animation: none;
    }

    .settings-content {
      scroll-behavior: auto;
    }
  }
</style>
