<script>

  import TaskHeader from './TaskHeader.svelte';

  import Composer from './Composer.svelte';

  import TaskList from './TaskList.svelte';

  import { panelTab } from '../stores/ui-store.js';



  // let opencodeMounted = $state(false);

  let calendarMounted = $state(false);

  let filesMounted = $state(false);

  let systemMounted = $state(false);

  // let OpenCodePanel = $state(null);

  let CalendarPanel = $state(null);

  let FilesPanel = $state(null);

  let SystemPanel = $state(null);



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

          aria-hidden={$panelTab !== 'system'}

        >

          <SystemPanel active={$panelTab === 'system'} />

        </div>

      {/if}

    </div>

  </div>

</section>

