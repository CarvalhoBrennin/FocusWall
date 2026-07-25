import type {
  AssistantPlan,
  AssistantPlanRisk,
  AssistantPlanSource,
  AssistantPlanStep,
  AssistantToolCall,
  AssistantToolName
} from '../types/assistant.js';
import { getAssistantToolCallArguments, getAssistantToolCallName, isAssistantToolName } from './tools.js';

function createPlanId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Recursively sorts object keys so equivalent arguments serialize identically. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)])
  );
}

/**
 * Identity of a tool call, used to detect duplicates. Always computed from the
 * raw call: validators rewrite arguments (add_calendar_event gains color and
 * recurrence), so a key taken after validation would never match the next
 * round's incoming call.
 */
export function toolCallKey(call: AssistantToolCall): string {
  return `${getAssistantToolCallName(call)}:${JSON.stringify(stableValue(getAssistantToolCallArguments(call)))}`;
}

function toolRisk(tool: AssistantToolName): AssistantPlanRisk {
  if (tool === 'delete_task' || tool === 'delete_calendar_event' || tool === 'delete_calendar_events') return 'high';
  if (tool === 'update_calendar_event' || tool === 'complete_task' || tool === 'set_task_priority' || tool === 'pin_task') return 'medium';
  return 'low';
}

function maxRisk(left: AssistantPlanRisk, right: AssistantPlanRisk): AssistantPlanRisk {
  const order: Record<AssistantPlanRisk, number> = { low: 0, medium: 1, high: 2 };
  return order[right] > order[left] ? right : left;
}

function sourceConfidence(source: AssistantPlanSource): number {
  if (source === 'deterministic') return 0.95;
  if (source === 'confirmation') return 1;
  if (source === 'model_tool') return 0.74;
  return 0.66;
}

function describeToolStep(tool: AssistantToolName): string {
  switch (tool) {
    case 'add_task':
      return 'Criar tarefa';
    case 'complete_task':
      return 'Atualizar conclusão da tarefa';
    case 'delete_task':
      return 'Excluir tarefa';
    case 'set_task_priority':
      return 'Alterar prioridade da tarefa';
    case 'pin_task':
      return 'Atualizar fixação da tarefa';
    case 'list_tasks':
      return 'Listar tarefas';
    case 'add_calendar_event':
      return 'Criar evento no calendário';
    case 'update_calendar_event':
      return 'Atualizar evento no calendário';
    case 'delete_calendar_event':
    case 'delete_calendar_events':
      return 'Excluir evento do calendário';
    case 'list_calendar_events':
      return 'Listar eventos do calendário';
    case 'go_to_date':
      return 'Abrir data';
    case 'go_to_today':
      return 'Voltar para hoje';
    case 'get_context':
      return 'Ler contexto do painel';
  }
}

export function createAssistantPlanFromToolCalls(
  calls: AssistantToolCall[],
  source: AssistantPlanSource,
  originalText: string
): AssistantPlan | null {
  const steps: AssistantPlanStep[] = [];
  let risk: AssistantPlanRisk = 'low';

  for (const call of calls) {
    const tool = getAssistantToolCallName(call);
    if (!isAssistantToolName(tool)) continue;
    const stepRisk = toolRisk(tool);
    risk = maxRisk(risk, stepRisk);
    steps.push({
      id: `${createPlanId()}-step-${steps.length + 1}`,
      tool,
      args: getAssistantToolCallArguments(call),
      description: describeToolStep(tool),
      risk: stepRisk,
      sourceKey: toolCallKey(call)
    });
  }

  if (!steps.length) return null;

  return {
    id: createPlanId(),
    source,
    status: 'ready',
    confidence: sourceConfidence(source),
    risk,
    originalText,
    steps
  };
}

export function planStepToToolCall(step: AssistantPlanStep): AssistantToolCall {
  return {
    function: {
      name: step.tool,
      arguments: step.args
    }
  };
}
