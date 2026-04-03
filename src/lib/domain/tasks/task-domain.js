import { CONFIG, PRIORITY_ORDER } from '../../config.js';
import {
  normalizeTaskText,
  normalizePriority,
  getLocalDateKey,
  parseDateKey,
  addDays,
  createId,
  cloneTask,
  getPinnedCount,
  findTaskIndex
} from '../../utils/state.js';

export function ensureDateBucket(state, dateKey) {
  const tasksByDate = { ...state.tasksByDate };
  if (!Array.isArray(tasksByDate[dateKey])) tasksByDate[dateKey] = [];
  return { ...state, tasksByDate };
}

export function pruneTaskHistory(state, currentDateKey) {
  const cutoff = getLocalDateKey(addDays(parseDateKey(currentDateKey), -CONFIG.HISTORY_RETENTION_DAYS));
  const tasksByDate = { ...state.tasksByDate };
  for (const dateKey of Object.keys(tasksByDate)) {
    if (dateKey < cutoff) delete tasksByDate[dateKey];
  }
  return { ...state, tasksByDate };
}

export function resolveVisibleDateKey(currentDateKey, viewOffsetDays) {
  return getLocalDateKey(addDays(parseDateKey(currentDateKey), viewOffsetDays));
}

export function getTasksForDate(state, dateKey) {
  return Array.isArray(state.tasksByDate?.[dateKey]) ? state.tasksByDate[dateKey] : [];
}

export function createTaskForList(text, priority, nowIso = new Date().toISOString()) {
  const normalizedText = normalizeTaskText(text);
  if (!normalizedText) return null;
  return {
    id: createId(),
    text: normalizedText,
    completed: false,
    pinned: false,
    priority: normalizePriority(priority),
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function insertTaskRespectingPinOrder(tasks, task) {
  const next = tasks.map(cloneTask);
  next.splice(getPinnedCount(next), 0, cloneTask(task));
  return next;
}

export function patchTaskById(tasks, taskId, updater) {
  const next = tasks.map(cloneTask);
  let changed = false;
  for (const task of next) {
    if (task.id !== taskId) continue;
    updater(task);
    changed = true;
    break;
  }
  return changed ? next : null;
}

export function toggleTaskCompleted(tasks, taskId, nowIso = new Date().toISOString()) {
  return patchTaskById(tasks, taskId, (task) => {
    task.completed = !task.completed;
    task.updatedAt = nowIso;
  });
}

export function cycleTaskPriorityValue(tasks, taskId, nowIso = new Date().toISOString()) {
  return patchTaskById(tasks, taskId, (task) => {
    const index = PRIORITY_ORDER.indexOf(task.priority);
    task.priority = PRIORITY_ORDER[(index + 1) % PRIORITY_ORDER.length];
    task.updatedAt = nowIso;
  });
}

export function toggleTaskPinned(tasks, taskId, nowIso = new Date().toISOString()) {
  const next = tasks.map(cloneTask);
  const index = findTaskIndex(next, taskId);
  if (index === -1) return null;
  const task = next[index];
  next.splice(index, 1);
  task.pinned = !task.pinned;
  task.updatedAt = nowIso;
  next.splice(task.pinned ? 0 : getPinnedCount(next), 0, task);
  return next;
}

export function moveTaskInsidePinSegment(tasks, taskId, direction, nowIso = new Date().toISOString()) {
  const next = tasks.map(cloneTask);
  const index = findTaskIndex(next, taskId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= next.length) return null;
  if (next[index].pinned !== next[target].pinned) return null;
  const current = next[index];
  current.updatedAt = nowIso;
  next[index] = next[target];
  next[target] = current;
  return next;
}

export function renameTaskText(tasks, taskId, nextText, nowIso = new Date().toISOString()) {
  const normalizedText = normalizeTaskText(nextText);
  if (!normalizedText) return null;
  return patchTaskById(tasks, taskId, (task) => {
    task.text = normalizedText;
    task.updatedAt = nowIso;
  });
}

export function removeTaskWithMetadata(tasks, taskId) {
  const index = findTaskIndex(tasks, taskId);
  if (index === -1) return null;

  const cloned = tasks.map(cloneTask);
  const deletedTask = cloneTask(cloned[index]);
  const pinnedCountBefore = getPinnedCount(cloned);
  cloned.splice(index, 1);

  return {
    nextTasks: cloned,
    deletedTask,
    deletedIndex: index,
    pinnedCountBefore
  };
}

export function restoreDeletedTask(tasks, deletedTask, deletedIndex, pinnedCountBefore) {
  const current = tasks.map(cloneTask);
  const pinnedCount = getPinnedCount(current);
  const insertAt = deletedTask.pinned
    ? Math.min(deletedIndex, pinnedCount)
    : pinnedCount + Math.min(Math.max(0, deletedIndex - pinnedCountBefore), current.length - pinnedCount);
  current.splice(insertAt, 0, cloneTask(deletedTask));
  return current;
}
