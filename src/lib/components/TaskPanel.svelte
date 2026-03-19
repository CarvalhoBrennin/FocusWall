<script>
  import TaskHeader from './TaskHeader.svelte';
  import Composer from './Composer.svelte';
  import TaskList from './TaskList.svelte';
</script>

<section class="task-panel panel" aria-labelledby="tasks-title">
  <div class="task-panel-frame">
    <TaskHeader />
    <Composer />
    <TaskList />
  </div>
</section>
