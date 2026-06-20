<script>

  import TaskHeader from './TaskHeader.svelte';

  import Composer from './Composer.svelte';

  import TaskList from './TaskList.svelte';

  import { panelTab } from '../stores/ui-store.js';



  // let opencodeMounted = $state(false);

  let calendarMounted = $state(false);

  let filesMounted = $state(false);

  let systemMounted = $state(false);

  let mediaMounted = $state(false);

  // let OpenCodePanel = $state(null);

  let CalendarPanel = $state(null);

  let FilesPanel = $state(null);

  let SystemPanel = $state(null);

  let MediaPanel = $state(null);



  $effect(() => {

    // if ($panelTab === 'opencode') {
    //   opencodeMounted = true;
    //   if (!OpenCodePanel) {
    //     import('./OpenCodePanel.svelte').then((mod) => {
    //       OpenCodePanel = mod.default;
    //     });
    //   }
    // }

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

      systemMounted = true;

      if (!SystemPanel) {

        import('./system/SystemPanel.svelte').then((mod) => {

          SystemPanel = mod.default;

        });

      }

    }

    if ($panelTab === 'media') {
      mediaMounted = true;
      if (!MediaPanel) {
        import('./media/MediaPanel.svelte').then((mod) => {
          MediaPanel = mod.default;
        });
      }
    }

    // Vivarium archived — set VIVARIUM_ENABLED in src/lib/features.ts to restore.
    // if ($panelTab === 'vivarium') {
    //   vivariumMounted = true;
    //   if (!VivariumTab) {
    //     import('./vivarium/components/VivariumTab.svelte').then((mod) => {
    //       VivariumTab = mod.default;
    //     });
    //   }
    // }

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



      <!-- OpenCode panel oculto temporariamente
      {#if opencodeMounted && OpenCodePanel}
        <div
          id="opencode-panel"
          class="panel-view"
          class:is-active={$panelTab === 'opencode'}
          aria-hidden={$panelTab !== 'opencode'}
        >
          <OpenCodePanel active={$panelTab === 'opencode'} />
        </div>
      {/if}
      -->

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



      {#if systemMounted && SystemPanel}

        <div
          id="system-panel"
          class="panel-view"
          class:is-active={$panelTab === 'system'}
          role="tabpanel"
          aria-labelledby="system-tab"
          tabindex={$panelTab === 'system' ? 0 : -1}
          aria-hidden={$panelTab !== 'system'}
        >

          <SystemPanel active={$panelTab === 'system'} />

        </div>

      {/if}

      {#if mediaMounted && MediaPanel}
        <div
          id="media-panel"
          class="panel-view"
          class:is-active={$panelTab === 'media'}
          role="tabpanel"
          aria-labelledby="media-tab"
          tabindex={$panelTab === 'media' ? 0 : -1}
          aria-hidden={$panelTab !== 'media'}
        >
          <MediaPanel active={$panelTab === 'media'} />
        </div>
      {/if}

      <!-- Vivarium panel archived — see src/lib/features.ts
      {#if vivariumMounted && VivariumTab}
        <div
          id="vivarium-panel"
          class="panel-view"
          class:is-active={$panelTab === 'vivarium'}
          aria-hidden={$panelTab !== 'vivarium'}
        >
          <VivariumTab
            active={$panelTab === 'vivarium'}
            completedTasksToday={($visibleTasks || []).filter((t) => t.completed).length}
            totalTasksToday={($visibleTasks || []).length}
          />
        </div>
      {/if}
      -->

    </div>

  </div>

</section>

