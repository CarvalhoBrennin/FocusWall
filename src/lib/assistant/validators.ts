import type {
  AssistantPlan,
  AssistantPlanStep,
  AssistantPlanValidation,
  AssistantToolArguments
} from '../types/assistant.js';
import {
  normalizeCalendarColor,
  normalizeCalendarRecurrence,
  normalizeDateKey,
  normalizePriority,
  normalizeTimeValue
} from '../utils/state.js';
import { hasInvalidToolArguments } from './tools.js';
import {
  getStringArg,
  hasSuspiciousCalendarTitle,
  isBirthdayText,
  sanitizeCalendarTitle
} from './normalizers.js';

const validRecurrences = new Set(['none', 'weekly', 'monthly', 'yearly']);
const validColors = new Set(['neutral', 'accent', 'success', 'danger']);
const validPriorities = new Set(['high', 'medium', 'low']);

interface PlanValidationResult {
  plan: AssistantPlan;
  validation: AssistantPlanValidation;
}

function validation(
  ok: boolean,
  reason: string,
  options: Partial<AssistantPlanValidation> = {}
): AssistantPlanValidation {
  return {
    ok,
    needsConfirmation: false,
    reason,
    ...options
  };
}

function validateDateArg(args: AssistantToolArguments, name = 'dateKey'): string {
  return normalizeDateKey(getStringArg(args, name));
}

function validateAddCalendarEventStep(step: AssistantPlanStep, originalText: string): AssistantPlanValidation {
  const args = { ...step.args };
  const title = sanitizeCalendarTitle(getStringArg(args, 'title'), originalText);
  const dateKey = validateDateArg(args);

  if (!title) {
    return validation(false, 'invalid_title', {
      question: 'Qual título devo usar para esse evento?'
    });
  }
  if (hasSuspiciousCalendarTitle(title)) {
    return validation(false, 'suspicious_title', {
      needsConfirmation: true,
      fixedArgs: { ...args, title },
      question: `O título do evento parece incompleto: "${title}". Quer salvar assim?`
    });
  }
  if (!dateKey) {
    return validation(false, 'invalid_date', {
      question: 'Qual data devo usar para esse evento?'
    });
  }

  const startTime = normalizeTimeValue(getStringArg(args, 'startTime'));
  const endTime = normalizeTimeValue(getStringArg(args, 'endTime'));
  if ('startTime' in args && getStringArg(args, 'startTime') && !startTime) {
    return validation(false, 'invalid_start_time', { question: 'Qual horário inicial devo usar? Use HH:mm.' });
  }
  if ('endTime' in args && getStringArg(args, 'endTime') && !endTime) {
    return validation(false, 'invalid_end_time', { question: 'Qual horário final devo usar? Use HH:mm.' });
  }
  if (startTime && endTime && endTime < startTime) {
    return validation(false, 'invalid_time_range', {
      question: 'O horário final ficou antes do inicial. Qual intervalo devo usar?'
    });
  }

  const rawRecurrence = getStringArg(args, 'recurrence');
  if (rawRecurrence && !validRecurrences.has(rawRecurrence)) {
    return validation(false, 'invalid_recurrence', {
      question: 'Essa recorrência não é válida. Use nenhuma, semanal, mensal ou anual.'
    });
  }

  const rawColor = getStringArg(args, 'color');
  if (rawColor && !validColors.has(rawColor)) {
    return validation(false, 'invalid_color', {
      question: 'Essa cor não é válida para o calendário.'
    });
  }

  const birthday = isBirthdayText(`${originalText} ${title}`);
  const recurrence = birthday ? 'yearly' : normalizeCalendarRecurrence(rawRecurrence);
  const color = birthday && !rawColor ? 'accent' : normalizeCalendarColor(rawColor);

  return validation(true, 'ok', {
    fixedArgs: {
      ...args,
      title,
      dateKey,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      color,
      recurrence
    },
    confidence: birthday ? 0.95 : undefined
  });
}

function validateUpdateCalendarEventStep(step: AssistantPlanStep, originalText: string): AssistantPlanValidation {
  const args = { ...step.args };
  const id = getStringArg(args, 'id');
  if (!id) {
    return validation(false, 'missing_id', {
      question: 'Qual evento devo atualizar?'
    });
  }

  const fixedArgs: AssistantToolArguments = { ...args, id };
  if ('title' in args) {
    const title = sanitizeCalendarTitle(getStringArg(args, 'title'), originalText);
    if (!title || hasSuspiciousCalendarTitle(title)) {
      return validation(false, 'suspicious_title', {
        needsConfirmation: true,
        fixedArgs: { ...fixedArgs, title },
        question: `O novo título parece incompleto: "${title}". Quer salvar assim?`
      });
    }
    fixedArgs.title = title;
  }
  if ('dateKey' in args) {
    const dateKey = validateDateArg(args);
    if (!dateKey) return validation(false, 'invalid_date', { question: 'Qual nova data devo usar?' });
    fixedArgs.dateKey = dateKey;
  }
  if ('startTime' in args) {
    const startTime = normalizeTimeValue(getStringArg(args, 'startTime'));
    if (getStringArg(args, 'startTime') && !startTime) return validation(false, 'invalid_start_time', { question: 'Qual horário inicial devo usar?' });
    fixedArgs.startTime = startTime;
  }
  if ('endTime' in args) {
    const endTime = normalizeTimeValue(getStringArg(args, 'endTime'));
    if (getStringArg(args, 'endTime') && !endTime) return validation(false, 'invalid_end_time', { question: 'Qual horário final devo usar?' });
    fixedArgs.endTime = endTime;
  }
  const nextStartTime = typeof fixedArgs.startTime === 'string' ? fixedArgs.startTime : '';
  const nextEndTime = typeof fixedArgs.endTime === 'string' ? fixedArgs.endTime : '';
  if (nextStartTime && nextEndTime && nextEndTime < nextStartTime) {
    return validation(false, 'invalid_time_range', {
      question: 'O horário final ficou antes do inicial. Qual intervalo devo usar?'
    });
  }
  if ('recurrence' in args) {
    const recurrence = getStringArg(args, 'recurrence');
    if (recurrence && !validRecurrences.has(recurrence)) {
      return validation(false, 'invalid_recurrence', { question: 'Essa recorrência não é válida. Use nenhuma, semanal, mensal ou anual.' });
    }
    fixedArgs.recurrence = normalizeCalendarRecurrence(recurrence);
  }
  if ('color' in args) {
    const color = getStringArg(args, 'color');
    if (color && !validColors.has(color)) return validation(false, 'invalid_color', { question: 'Essa cor não é válida para o calendário.' });
    fixedArgs.color = normalizeCalendarColor(color);
  }

  return validation(true, 'ok', { fixedArgs });
}

function validateTaskStep(step: AssistantPlanStep): AssistantPlanValidation {
  const args = { ...step.args };
  if (step.tool === 'add_task') {
    const text = getStringArg(args, 'text');
    if (!text) return validation(false, 'invalid_text', { question: 'Qual tarefa devo criar?' });
    const priority = getStringArg(args, 'priority');
    const rawDateKey = getStringArg(args, 'dateKey');
    if (rawDateKey && !normalizeDateKey(rawDateKey)) {
      return validation(false, 'invalid_date', { question: 'Para qual data devo criar essa tarefa?' });
    }
    return validation(true, 'ok', {
      fixedArgs: {
        ...args,
        text,
        ...(rawDateKey ? { dateKey: normalizeDateKey(rawDateKey) } : {}),
        priority: validPriorities.has(priority) ? priority : normalizePriority(priority)
      }
    });
  }

  if (['complete_task', 'delete_task', 'set_task_priority', 'pin_task'].includes(step.tool)) {
    const id = getStringArg(args, 'id');
    if (!id) return validation(false, 'missing_id', { question: 'Qual tarefa devo alterar?' });
    if (step.tool === 'set_task_priority') {
      const priority = getStringArg(args, 'priority');
      if (!validPriorities.has(priority)) return validation(false, 'invalid_priority', { question: 'Qual prioridade devo usar: alta, média ou baixa?' });
    }
    return validation(true, 'ok', { fixedArgs: { ...args, id } });
  }

  return validation(true, 'ok', { fixedArgs: args });
}

function validateDateNavigationStep(step: AssistantPlanStep): AssistantPlanValidation {
  if (step.tool === 'list_calendar_events' && !getStringArg(step.args, 'dateKey')) {
    return validation(true, 'ok', { fixedArgs: step.args });
  }
  if (step.tool !== 'go_to_date' && step.tool !== 'list_calendar_events' && step.tool !== 'delete_calendar_events') {
    return validation(true, 'ok', { fixedArgs: step.args });
  }

  const dateKey = validateDateArg(step.args);
  if (!dateKey) {
    return validation(false, 'invalid_date', {
      question: step.tool === 'list_calendar_events' ? 'Qual data devo consultar?' : 'Qual data devo usar?'
    });
  }

  const fixedArgs: AssistantToolArguments = { ...step.args, dateKey };
  if (step.tool === 'delete_calendar_events') {
    const recurrence = getStringArg(step.args, 'recurrence');
    if (recurrence && !validRecurrences.has(recurrence)) {
      return validation(false, 'invalid_recurrence', {
        question: 'Essa recorrência não é válida. Use nenhuma, semanal, mensal ou anual.'
      });
    }
    if (recurrence) fixedArgs.recurrence = normalizeCalendarRecurrence(recurrence);
  }

  return validation(true, 'ok', { fixedArgs });
}

export function validateAssistantPlan(plan: AssistantPlan): PlanValidationResult {
  const steps: AssistantPlanStep[] = [];
  let needsConfirmation = false;
  let confidence = plan.confidence;
  let question = '';
  let reason = 'ok';

  for (const step of plan.steps) {
    if (hasInvalidToolArguments(step.args)) {
      return {
        plan: { ...plan, status: 'blocked', confidence, steps },
        validation: validation(false, 'invalid_arguments', {
          question: 'Os argumentos produzidos para a ação são inválidos. Reformule o pedido.'
        })
      };
    }

    let stepValidation: AssistantPlanValidation;
    if (step.tool === 'add_calendar_event') {
      stepValidation = validateAddCalendarEventStep(step, plan.originalText);
    } else if (step.tool === 'update_calendar_event') {
      stepValidation = validateUpdateCalendarEventStep(step, plan.originalText);
    } else if (step.tool.startsWith('delete_calendar') || step.tool === 'go_to_date' || step.tool === 'list_calendar_events') {
      stepValidation = validateDateNavigationStep(step);
    } else {
      stepValidation = validateTaskStep(step);
    }

    if (stepValidation.confidence !== undefined) {
      confidence = Math.max(confidence, stepValidation.confidence);
    }

    if (!stepValidation.ok && !stepValidation.needsConfirmation) {
      return {
        plan: { ...plan, status: 'blocked', confidence, steps },
        validation: stepValidation
      };
    }

    if (stepValidation.needsConfirmation) {
      needsConfirmation = true;
      question = stepValidation.question || question;
      reason = stepValidation.reason || reason;
    }

    steps.push({
      ...step,
      args: stepValidation.fixedArgs || step.args
    });
  }

  const status = needsConfirmation || confidence < 0.7 ? 'needs_confirmation' : 'ready';
  return {
    plan: { ...plan, status, confidence, steps },
    validation: validation(true, reason, {
      needsConfirmation: status === 'needs_confirmation',
      question: question || (status === 'needs_confirmation' ? 'Quer que eu execute essa ação?' : undefined),
      confidence
    })
  };
}
