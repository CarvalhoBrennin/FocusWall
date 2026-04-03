<script>
  import TaskHeader from './TaskHeader.svelte';
  import Composer from './Composer.svelte';
  import TaskTools from './TaskTools.svelte';
  import TaskList from './TaskList.svelte';
</script>

<section class="task-panel panel" aria-labelledby="tasks-title">
  <div class="task-panel-frame">
    <TaskHeader />
    <Composer />
    <TaskTools />
    <TaskList />
  </div>
</section>
