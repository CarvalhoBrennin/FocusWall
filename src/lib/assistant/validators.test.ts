import { describe, expect, it } from 'vitest';
import { createAssistantPlanFromToolCalls } from './planner.js';
import { validateAssistantPlan } from './validators.js';

function validateSingleCall(argumentsValue: Record<string, unknown>, originalText = '') {
  const plan = createAssistantPlanFromToolCalls(
    [
      {
        function: {
          name: 'add_calendar_event',
          arguments: argumentsValue
        }
      }
    ],
    'model_tool',
    originalText
  );
  if (!plan) throw new Error('Plan was not created.');
  return validateAssistantPlan(plan);
}

describe('assistant plan validators', () => {
  it('repairs birthday event titles from the original request', () => {
    const { plan, validation } = validateSingleCall(
      {
        title: 'Meu aniversário',
        dateKey: '2026-07-11'
      },
      'Aniversário da minha mãe é dia 11 de julho'
    );

    expect(validation.ok).toBe(true);
    expect(plan.steps[0]?.args.title).toBe('Aniversário da minha mãe');
    expect(plan.steps[0]?.args.recurrence).toBe('yearly');
  });

  it('sanitizes corrigible calendar titles', () => {
    const { plan, validation } = validateSingleCall({
      title: 'Aniversário de minha mãe é',
      dateKey: '2026-07-11',
      recurrence: 'yearly'
    });

    expect(validation.ok).toBe(true);
    expect(plan.steps[0]?.args.title).toBe('Aniversário da minha mãe');
  });

  it('uses the right possessive preposition for meu and minha birthday titles', () => {
    const mother = validateSingleCall({
      title: 'Aniversário de minha mãe é',
      dateKey: '2026-07-11',
      recurrence: 'yearly'
    });
    const father = validateSingleCall({
      title: 'Aniversário de meu pai é',
      dateKey: '2026-07-11',
      recurrence: 'yearly'
    });

    expect(mother.plan.steps[0]?.args.title).toBe('Aniversário da minha mãe');
    expect(father.plan.steps[0]?.args.title).toBe('Aniversário do meu pai');
  });

  it('blocks invalid calendar dates', () => {
    const { validation } = validateSingleCall({
      title: 'Reunião',
      dateKey: '2026-02-31'
    });

    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe('invalid_date');
    expect(validation.question).toContain('data');
  });

  it('blocks invalid recurrence values', () => {
    const { validation } = validateSingleCall({
      title: 'Backup',
      dateKey: '2026-07-11',
      recurrence: 'daily'
    });

    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe('invalid_recurrence');
  });

  it('blocks invalid time ranges on calendar updates', () => {
    const plan = createAssistantPlanFromToolCalls(
      [
        {
          function: {
            name: 'update_calendar_event',
            arguments: { id: 'event-1', startTime: '18:00', endTime: '09:00' }
          }
        }
      ],
      'model_tool',
      ''
    );
    if (!plan) throw new Error('Plan was not created.');

    const { validation } = validateAssistantPlan(plan);

    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe('invalid_time_range');
  });

  it('blocks invalid recurrence filters on bulk calendar deletion', () => {
    const plan = createAssistantPlanFromToolCalls(
      [
        {
          function: {
            name: 'delete_calendar_events',
            arguments: { dateKey: '2026-07-11', recurrence: 'daily' }
          }
        }
      ],
      'model_tool',
      ''
    );
    if (!plan) throw new Error('Plan was not created.');

    const { validation } = validateAssistantPlan(plan);

    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe('invalid_recurrence');
  });

  it('asks before saving suspicious event titles', () => {
    const { validation } = validateSingleCall({
      title: 'é',
      dateKey: '2026-07-11'
    });

    expect(validation.ok).toBe(true);
    expect(validation.needsConfirmation).toBe(true);
    expect(validation.question).toContain('título');
  });
});
