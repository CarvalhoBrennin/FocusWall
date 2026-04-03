export function getTaskPageMeta(tasks, perPage, currentPage) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safePerPage = Math.max(1, Number(perPage) || 1);
  const totalPages = Math.max(1, Math.ceil(safeTasks.length / safePerPage));
  const page = Math.min(Math.max(0, Number(currentPage) || 0), totalPages - 1);
  const start = safeTasks.length ? page * safePerPage + 1 : 0;
  const end = Math.min((page + 1) * safePerPage, safeTasks.length);

  return {
    page,
    totalPages,
    start,
    end,
    paginatedTasks: safeTasks.slice(page * safePerPage, (page + 1) * safePerPage)
  };
}
