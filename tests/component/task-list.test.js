import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TaskList from '../../src/lib/components/TaskList.svelte';
import { createDefaultState } from '../../src/lib/utils/state.js';
import { currentDateKey, data, lastAddedTaskId, viewOffsetDays } from '../../src/lib/stores/app-store.js';

const TODAY = '2026-04-03';

function makeTask(id, text) {
  return {
    id,
    text,
    completed: false,
    pinned: false,
    priority: 'medium',
    createdAt: '2026-04-03T10:00:00.000Z',
    updatedAt: '2026-04-03T10:00:00.000Z'
  };
}

describe('TaskList component', () => {
  beforeEach(() => {
    currentDateKey.set(TODAY);
    viewOffsetDays.set(0);
    lastAddedTaskId.set(null);
    const base = createDefaultState();
    data.set({
      ...base,
      tasksByDate: {
        [TODAY]: [
          makeTask('1', 'Task 1'),
          makeTask('2', 'Task 2'),
          makeTask('3', 'Task 3'),
          makeTask('4', 'Task 4'),
          makeTask('5', 'Task 5')
        ]
      }
    });
  });

  it('paginates visible tasks and navigates to next page', async () => {
    render(TaskList);

    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.queryByText('Task 5')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(screen.getByText('Task 5')).toBeInTheDocument();
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
