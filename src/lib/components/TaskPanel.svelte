<script>
  import { onDestroy, onMount } from 'svelte';
  import TaskHeader from './TaskHeader.svelte';
  import Composer from './Composer.svelte';
  import TaskList from './TaskList.svelte';
  import SystemSkeleton from './system/SystemSkeleton.svelte';
  import { panelTab } from '../stores/ui-store.js';
  import { visibleTasks } from '../stores/app-store.js';
  import {
    ASSISTANT_TAB_ENABLED,
    NEURAL_TAB_ENABLED,
    OPENCODE_TAB_ENABLED,
    RADAR_TAB_ENABLED,
    VIVARIUM_ENABLED
  } from '../features.js';

  let calendarMounted = $state(false);
  let filesMounted = $state(false);
  let mediaMounted = $state(false);
  let radarMounted = $state(false);
  let assistantMounted = $state(false);
  let opencodeMounted = $state(false);
  let neuralMounted = $state(false);
  let vivariumMounted = $state(false);

  let CalendarPanel = $state(null);
  let FilesPanel = $state(null);
  let SystemPanel = $state(null);
  let MusicPanel = $state(null);
  let RadarPanel = $state(null);
  let AssistantPanel = $state(null);
  let OpenCodePanel = $state(null);
  let NeuralPanel = $state(null);
  let VivariumTab = $state(null);
  let musicPanelPromise = null;
  let musicPreloadHandle = 0;

  function loadMusicPanel() {
    if (MusicPanel) return Promise.resolve(MusicPanel);
    if (!musicPanelPromise) {
      musicPanelPromise = import('./music/MusicPanel.svelte')
        .then((mod) => {
          MusicPanel = mod.default;
          return MusicPanel;
        })
        .catch((error) => {
          musicPanelPromise = null;
          throw error;
        });
    }
    return musicPanelPromise;
  }

  function scheduleMusicPreload() {
    const preload = () => {
      void loadMusicPanel().catch(() => {});
    };

    if (typeof window.requestIdleCallback === 'function') {
      musicPreloadHandle = window.requestIdleCallback(preload, { timeout: 2000 });
    } else {
      musicPreloadHandle = window.setTimeout(preload, 1200);
    }
  }

  $effect(() => {
    if ($panelTab === 'calendar') {
      calendarMounted = true;
      if (!CalendarPanel) {
        import('./calendar/CalendarPanel.svelte').then((mod) => {
          CalendarPanel = mod.default;
        });
      }
    }

    if ($panelTab === 'files') {
      filesMounted = true;
      if (!FilesPanel) {
        import('./files/FilesPanel.svelte').then((mod) => {
          FilesPanel = mod.default;
        });
      }
    }

    if ($panelTab === 'system') {
      if (!SystemPanel) {
        import('./system/SystemPanel.svelte').then((mod) => {
          SystemPanel = mod.default;
        });
      }
    }


    if (RADAR_TAB_ENABLED && $panelTab === 'radar') {
      radarMounted = true;
      if (!RadarPanel) {
        import('./radar/RadarPanel.svelte').then((mod) => {
          RadarPanel = mod.default;
        });
      }
    }

    if ($panelTab === 'media') {
      mediaMounted = true;
      if (!MusicPanel) {
        void loadMusicPanel().catch(() => {});
      }
    } else if (!MusicPanel) {
      mediaMounted = false;
    }

    if (ASSISTANT_TAB_ENABLED && $panelTab === 'assistant') {
      assistantMounted = true;
      if (!AssistantPanel) {
        import('./assistant/AssistantPanel.svelte').then((mod) => {
          AssistantPanel = mod.default;
        });
      }
    }

    if (OPENCODE_TAB_ENABLED && $panelTab === 'opencode') {
      opencodeMounted = true;
      if (!OpenCodePanel) {
        import('./OpenCodePanel.svelte').then((mod) => {
          OpenCodePanel = mod.default;
        });
      }
    }

    if (NEURAL_TAB_ENABLED && $panelTab === 'neural') {
      neuralMounted = true;
      if (!NeuralPanel) {
        import('./neural/NeuralPanel.svelte').then((mod) => {
          NeuralPanel = mod.default;
        });
      }
    }

    if (VIVARIUM_ENABLED && $panelTab === 'vivarium') {
      vivariumMounted = true;
      if (!VivariumTab) {
        import('./vivarium/components/VivariumTab.svelte').then((mod) => {
          VivariumTab = mod.default;
        });
      }
    }
  });

  onMount(scheduleMusicPreload);

  onDestroy(() => {
    if (typeof window.cancelIdleCallback === 'function' && musicPreloadHandle) {
      window.cancelIdleCallback(musicPreloadHandle);
    } else if (musicPreloadHandle) {
      window.clearTimeout(musicPreloadHandle);
    }
  });
</script>

<section class="task-panel panel" aria-labelledby="tasks-title">
  <div class="task-panel-frame">
    <TaskHeader />

    <div class="task-panel-body">
      <div
        id="execution-panel"
        class="panel-view"
        class:is-active={$panelTab === 'execution'}
        role="tabpanel"
        aria-labelledby="execution-tab"
        tabindex={$panelTab === 'execution' ? 0 : -1}
        aria-hidden={$panelTab !== 'execution'}
      >
        <Composer />
        <TaskList />
      </div>

      {#if OPENCODE_TAB_ENABLED && opencodeMounted && OpenCodePanel}
        <div
          id="opencode-panel"
          class="panel-view"
          class:is-active={$panelTab === 'opencode'}
          role="tabpanel"
          aria-labelledby="opencode-tab"
          tabindex={$panelTab === 'opencode' ? 0 : -1}
          aria-hidden={$panelTab !== 'opencode'}
        >
          <OpenCodePanel active={$panelTab === 'opencode'} />
        </div>
      {/if}

      {#if calendarMounted && CalendarPanel}
        <div
          id="calendar-panel"
          class="panel-view"
          class:is-active={$panelTab === 'calendar'}
          role="tabpanel"
          aria-labelledby="calendar-tab"
          tabindex={$panelTab === 'calendar' ? 0 : -1}
          aria-hidden={$panelTab !== 'calendar'}
        >
          <CalendarPanel active={$panelTab === 'calendar'} />
        </div>
      {/if}

      {#if filesMounted && FilesPanel}
        <div
          id="files-panel"
          class="panel-view"
          class:is-active={$panelTab === 'files'}
          role="tabpanel"
          aria-labelledby="files-tab"
          tabindex={$panelTab === 'files' ? 0 : -1}
          aria-hidden={$panelTab !== 'files'}
        >
          <FilesPanel />
        </div>
      {/if}

      {#if $panelTab === 'system'}
        <div
          id="system-panel"
          class="panel-view"
          class:is-active={true}
          role="tabpanel"
          aria-labelledby="system-tab"
          tabindex="0"
        >
          {#if SystemPanel}
            <SystemPanel />
          {:else}
            <SystemSkeleton />
          {/if}
        </div>
      {/if}


      {#if RADAR_TAB_ENABLED && radarMounted && RadarPanel}
        <div
          id="radar-panel"
          class="panel-view"
          class:is-active={$panelTab === 'radar'}
          role="tabpanel"
          aria-labelledby="radar-tab"
          tabindex={$panelTab === 'radar' ? 0 : -1}
          aria-hidden={$panelTab !== 'radar'}
        >
          <RadarPanel active={$panelTab === 'radar'} />
        </div>
      {/if}

      {#if mediaMounted && MusicPanel}
        <div
          id="media-panel"
          class="panel-view"
          class:is-active={$panelTab === 'media'}
          role="tabpanel"
          aria-labelledby="media-tab"
          tabindex={$panelTab === 'media' ? 0 : -1}
          aria-hidden={$panelTab !== 'media'}
        >
          <MusicPanel active={$panelTab === 'media'} />
        </div>
      {/if}

      {#if ASSISTANT_TAB_ENABLED && assistantMounted && AssistantPanel}
        <div
          id="assistant-panel"
          class="panel-view"
          class:is-active={$panelTab === 'assistant'}
          role="tabpanel"
          aria-labelledby="assistant-tab"
          tabindex={$panelTab === 'assistant' ? 0 : -1}
          aria-hidden={$panelTab !== 'assistant'}
        >
          <AssistantPanel active={$panelTab === 'assistant'} />
        </div>
      {/if}

      {#if NEURAL_TAB_ENABLED && neuralMounted && NeuralPanel}
        <div
          id="neural-panel"
          class="panel-view"
          class:is-active={$panelTab === 'neural'}
          role="tabpanel"
          aria-labelledby="neural-tab"
          tabindex={$panelTab === 'neural' ? 0 : -1}
          aria-hidden={$panelTab !== 'neural'}
        >
          <NeuralPanel active={$panelTab === 'neural'} />
        </div>
      {/if}

      {#if VIVARIUM_ENABLED && vivariumMounted && VivariumTab}
        <div
          id="vivarium-panel"
          class="panel-view"
          class:is-active={$panelTab === 'vivarium'}
          role="tabpanel"
          aria-labelledby="vivarium-tab"
          tabindex={$panelTab === 'vivarium' ? 0 : -1}
          aria-hidden={$panelTab !== 'vivarium'}
        >
          <VivariumTab
            active={$panelTab === 'vivarium'}
            completedTasksToday={($visibleTasks || []).filter((t) => t.completed).length}
            totalTasksToday={($visibleTasks || []).length}
          />
        </div>
      {/if}
    </div>
  </div>
</section>
