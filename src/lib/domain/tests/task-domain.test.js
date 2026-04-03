import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTaskForList,
  toggleTaskPinned,
  moveTaskInsidePinSegment,
  removeTaskWithMetadata,
  restoreDeletedTask
} from '../tasks/task-domain.js';

test('createTaskForList normaliza texto e prioridade', () => {
  const task = createTaskForList('  tarefa   nova ', 'high', '2026-01-01T00:00:00.000Z');
  assert.equal(task.text, 'tarefa nova');
  assert.equal(task.priority, 'high');
  assert.equal(task.createdAt, '2026-01-01T00:00:00.000Z');
});

test('toggleTaskPinned mantém ordem por segmento', () => {
  const tasks = [
    { id: 'a', text: 'A', pinned: false, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' },
    { id: 'b', text: 'B', pinned: false, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' }
  ];
  const next = toggleTaskPinned(tasks, 'b', '2026-01-01T00:00:00.000Z');
  assert.deepEqual(next.map((task) => [task.id, task.pinned]), [['b', true], ['a', false]]);
});

test('moveTaskInsidePinSegment bloqueia troca entre segmentos', () => {
  const tasks = [
    { id: 'a', text: 'A', pinned: true, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' },
    { id: 'b', text: 'B', pinned: false, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' }
  ];
  const next = moveTaskInsidePinSegment(tasks, 'a', 1);
  assert.equal(next, null);
});

test('removeTaskWithMetadata + restoreDeletedTask reconstroem posição', () => {
  const tasks = [
    { id: 'p1', text: 'P1', pinned: true, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' },
    { id: 'n1', text: 'N1', pinned: false, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' },
    { id: 'n2', text: 'N2', pinned: false, completed: false, priority: 'medium', createdAt: 'x', updatedAt: 'x' }
  ];
  const deletion = removeTaskWithMetadata(tasks, 'n1');
  const restored = restoreDeletedTask(deletion.nextTasks, deletion.deletedTask, deletion.deletedIndex, deletion.pinnedCountBefore);
  assert.deepEqual(restored.map((task) => task.id), ['p1', 'n1', 'n2']);
});
