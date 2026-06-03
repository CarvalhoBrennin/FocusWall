#!/usr/bin/env node
/**
 * Preenche maio com tarefas e eventos de demonstração (gravacao LinkedIn).
 * Idempotente: remove entradas com id prefixo "demo-may-" antes de reinserir.
 *
 * Uso: npm run seed:demo-may
 *      DEMO_YEAR=2025 npm run seed:demo-may
 *      FOCUSWALL_STATE_PATH="C:\\...\\dashboard-state.json" npm run seed:demo-may
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_ID = 'com.carva.focusdashboard';
const STATE_VERSION = 5;
const DEMO_PREFIX = 'demo-may-';
const YEAR = process.env.DEMO_YEAR || '2026';
const MONTH = '05';

function resolveStatePath() {
  if (process.env.FOCUSWALL_STATE_PATH) {
    return path.resolve(process.env.FOCUSWALL_STATE_PATH);
  }
  const roaming =
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(roaming, APP_ID, 'dashboard-state.json');
}

function iso(dateKey, hour = 10, minute = 0) {
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function task(id, dateKey, text, { completed = false, priority = 'medium', pinned = false, hour = 9 } = {}) {
  const at = iso(dateKey, hour);
  return {
    id: `${DEMO_PREFIX}${id}`,
    text,
    completed,
    pinned,
    priority,
    createdAt: at,
    updatedAt: at
  };
}

function event(id, dateKey, title, { startTime, endTime, notes, color = 'accent', hour = 14 } = {}) {
  const at = iso(dateKey, hour);
  return {
    id: `${DEMO_PREFIX}${id}`,
    title,
    dateKey,
    startTime,
    endTime,
    notes,
    color,
    createdAt: at,
    updatedAt: at
  };
}

const TASKS_BY_DATE = {
  [`${YEAR}-${MONTH}-03`]: [
    task('t-0301', `${YEAR}-${MONTH}-03`, 'Revisar PR do servico de metricas', { completed: true, priority: 'high', hour: 9 }),
    task('t-0302', `${YEAR}-${MONTH}-03`, 'Organizar backlog FocusWall', { completed: true, hour: 11 }),
    task('t-0303', `${YEAR}-${MONTH}-03`, 'Caminhada 5 km no parque', { completed: true, priority: 'low', hour: 17 })
  ],
  [`${YEAR}-${MONTH}-05`]: [
    task('t-0501', `${YEAR}-${MONTH}-05`, 'Daily standup async no Slack', { completed: true, hour: 8 }),
    task('t-0502', `${YEAR}-${MONTH}-05`, 'Implementar lazy-load aba Sistema', { completed: true, priority: 'high', hour: 10 }),
    task('t-0503', `${YEAR}-${MONTH}-05`, 'Code review PR — normalizacao FileEntry', { completed: true, hour: 15 }),
    task('t-0504', `${YEAR}-${MONTH}-05`, 'Responder thread de arquitetura Tauri', { completed: false, hour: 16 })
  ],
  [`${YEAR}-${MONTH}-07`]: [
    task('t-0701', `${YEAR}-${MONTH}-07`, 'Refatorar stores (calendar + ui)', { completed: true, priority: 'high', hour: 9 }),
    task('t-0702', `${YEAR}-${MONTH}-07`, 'Escrever testes Vitest system-metrics', { completed: true, hour: 13 }),
    task('t-0703', `${YEAR}-${MONTH}-07`, 'Mercado + meal prep da semana', { completed: true, priority: 'low', hour: 19 })
  ],
  [`${YEAR}-${MONTH}-09`]: [
    task('t-0901', `${YEAR}-${MONTH}-09`, 'Fix calendario preso em mes antigo', { completed: true, priority: 'high', hour: 8 }),
    task('t-0902', `${YEAR}-${MONTH}-09`, 'Atualizar docs DEPLOY e PLAN-METRICS', { completed: true, hour: 11 }),
    task('t-0903', `${YEAR}-${MONTH}-09`, 'Rascunho roteiro video LinkedIn', { completed: false, pinned: true, hour: 14 }),
    task('t-0904', `${YEAR}-${MONTH}-09`, 'Jantar com familia (sem celular)', { completed: true, priority: 'low', hour: 20 })
  ],
  [`${YEAR}-${MONTH}-12`]: [
    task('t-1201', `${YEAR}-${MONTH}-12`, 'Pair programming — comandos Rust', { completed: true, hour: 10 }),
    task('t-1202', `${YEAR}-${MONTH}-12`, 'Revisar permissions app-commands.toml', { completed: true, priority: 'medium', hour: 14 }),
    task('t-1203', `${YEAR}-${MONTH}-12`, 'Ler capitulo Rust ownership', { completed: false, priority: 'low', hour: 21 })
  ],
  [`${YEAR}-${MONTH}-14`]: [
    task('t-1401', `${YEAR}-${MONTH}-14`, 'Sprint planning Q2', { completed: true, priority: 'high', hour: 9 }),
    task('t-1402', `${YEAR}-${MONTH}-14`, 'Priorizar aba metricas do PC', { completed: true, hour: 11 }),
    task('t-1403', `${YEAR}-${MONTH}-14`, 'Triagem issues GitHub', { completed: true, hour: 15 }),
    task('t-1404', `${YEAR}-${MONTH}-14`, 'Comprar presente aniversario amigo', { completed: false, priority: 'low', hour: 18 })
  ],
  [`${YEAR}-${MONTH}-16`]: [
    task('t-1601', `${YEAR}-${MONTH}-16`, 'Icones por extensao no explorador', { completed: true, priority: 'high', hour: 9 }),
    task('t-1602', `${YEAR}-${MONTH}-16`, 'CSS brutalista — painel Arquivos', { completed: true, hour: 12 }),
    task('t-1603', `${YEAR}-${MONTH}-16`, 'Bloco foco profundo (sem notificacoes)', { completed: true, hour: 14 })
  ],
  [`${YEAR}-${MONTH}-19`]: [
    task('t-1901', `${YEAR}-${MONTH}-19`, 'npm audit + alinhar plugin-updater', { completed: true, hour: 8 }),
    task('t-1902', `${YEAR}-${MONTH}-19`, 'Build release Windows (--no-bundle)', { completed: true, priority: 'high', hour: 10 }),
    task('t-1903', `${YEAR}-${MONTH}-19`, 'Testar bootstrapper e atalho .bat', { completed: false, hour: 16 }),
    task('t-1904', `${YEAR}-${MONTH}-19`, 'Noite de jogos com amigos', { completed: true, priority: 'low', hour: 21 })
  ],
  [`${YEAR}-${MONTH}-20`]: [
    task('t-2001', `${YEAR}-${MONTH}-20`, 'Agregacao processos estilo Task Manager', { completed: true, priority: 'high', hour: 9 }),
    task('t-2002', `${YEAR}-${MONTH}-20`, 'WMI temperatura com fallback', { completed: true, hour: 11 }),
    task('t-2003', `${YEAR}-${MONTH}-20`, 'Preparar gravacao LinkedIn', { completed: false, pinned: true, priority: 'high', hour: 14 }),
    task('t-2004', `${YEAR}-${MONTH}-20`, 'Limpar area de trabalho / Downloads', { completed: true, priority: 'low', hour: 17 })
  ],
  [`${YEAR}-${MONTH}-22`]: [
    task('t-2201', `${YEAR}-${MONTH}-22`, 'Revisar aba Sistema antes de gravar', { completed: false, pinned: true, priority: 'high', hour: 9 }),
    task('t-2202', `${YEAR}-${MONTH}-22`, 'Rodar seed demo maio + smoke test', { completed: true, hour: 10 }),
    task('t-2203', `${YEAR}-${MONTH}-22`, 'Post LinkedIn — rascunho final', { completed: false, hour: 13 }),
    task('t-2204', `${YEAR}-${MONTH}-22`, 'Cafe da tarde + pausa 20 min', { completed: true, priority: 'low', hour: 16 })
  ],
  [`${YEAR}-${MONTH}-24`]: [
    task('t-2401', `${YEAR}-${MONTH}-24`, 'Coletar feedback beta testers', { completed: false, hour: 10 }),
    task('t-2402', `${YEAR}-${MONTH}-24`, 'Ajustar copy UI (pt-BR)', { completed: true, hour: 12 }),
    task('t-2403', `${YEAR}-${MONTH}-24`, 'Backup dashboard-state.json', { completed: true, priority: 'medium', hour: 18 })
  ],
  [`${YEAR}-${MONTH}-26`]: [
    task('t-2601', `${YEAR}-${MONTH}-26`, 'Inbox zero — email e Slack', { completed: true, hour: 8 }),
    task('t-2602', `${YEAR}-${MONTH}-26`, 'Atualizar README com aba Sistema', { completed: false, hour: 11 }),
    task('t-2603', `${YEAR}-${MONTH}-26`, 'Planejar integracao OpenCode (futuro)', { completed: false, priority: 'low', hour: 15 })
  ],
  [`${YEAR}-${MONTH}-28`]: [
    task('t-2801', `${YEAR}-${MONTH}-28`, 'Merge branch features → main', { completed: true, priority: 'high', hour: 9 }),
    task('t-2802', `${YEAR}-${MONTH}-28`, 'Checklist entrega sprint', { completed: true, hour: 14 }),
    task('t-2803', `${YEAR}-${MONTH}-28`, 'Comprar cafe em grao', { completed: true, priority: 'low', hour: 17 })
  ],
  [`${YEAR}-${MONTH}-30`]: [
    task('t-3001', `${YEAR}-${MONTH}-30`, 'Retrospectiva de maio', { completed: false, priority: 'high', hour: 10 }),
    task('t-3002', `${YEAR}-${MONTH}-30`, 'Planejar metas de junho', { completed: false, hour: 11 }),
    task('t-3003', `${YEAR}-${MONTH}-30`, 'Churrasco no fim de semana — lista compras', { completed: false, priority: 'low', hour: 16 })
  ]
};

const CALENDAR_EVENTS = [
  event('e-0301', `${YEAR}-${MONTH}-03`, 'Cafe + leitura tecnica', { startTime: '09:00', endTime: '10:30', color: 'neutral', hour: 8 }),
  event('e-0501', `${YEAR}-${MONTH}-05`, 'Call alinhamento produto', { startTime: '15:00', endTime: '15:45', notes: 'Demo explorador v2', color: 'accent' }),
  event('e-0701', `${YEAR}-${MONTH}-07`, 'Academia', { startTime: '07:00', endTime: '08:00', color: 'success', hour: 6 }),
  event('e-0901', `${YEAR}-${MONTH}-09`, 'Deploy staging', { startTime: '18:00', endTime: '18:30', color: 'danger', hour: 17 }),
  event('e-1201', `${YEAR}-${MONTH}-12`, 'Dentista', { startTime: '10:30', endTime: '11:30', color: 'neutral', hour: 9 }),
  event('e-1401', `${YEAR}-${MONTH}-14`, 'Almoco networking', { startTime: '12:30', endTime: '13:30', notes: 'Contato UX', color: 'accent' }),
  event('e-1601', `${YEAR}-${MONTH}-16`, 'Focus block — deep work', { startTime: '09:00', endTime: '12:00', color: 'success' }),
  event('e-1901', `${YEAR}-${MONTH}-19`, 'Demo interna metricas', { startTime: '14:00', endTime: '15:00', color: 'accent' }),
  event('e-2001', `${YEAR}-${MONTH}-20`, 'Gravacao video LinkedIn', { startTime: '17:00', endTime: '18:30', notes: 'FocusWall + rotina dev', color: 'danger', hour: 16 }),
  event('e-2201', `${YEAR}-${MONTH}-22`, '1:1 com mentor', { startTime: '16:00', endTime: '16:45', color: 'neutral' }),
  event('e-2401', `${YEAR}-${MONTH}-24`, 'Meetup dev local', { startTime: '19:00', endTime: '21:00', color: 'accent', hour: 18 }),
  event('e-2601', `${YEAR}-${MONTH}-26`, 'Terapia', { startTime: '19:00', endTime: '20:00', color: 'neutral', hour: 18 }),
  event('e-2801', `${YEAR}-${MONTH}-28`, 'Entrega sprint', { startTime: '17:00', endTime: '17:30', color: 'success' }),
  event('e-3001', `${YEAR}-${MONTH}-30`, 'Cafe com colega dev', { startTime: '11:00', endTime: '12:00', color: 'neutral' })
];

function stripDemoEntries(state) {
  for (const dk of Object.keys(state.tasksByDate || {})) {
    state.tasksByDate[dk] = (state.tasksByDate[dk] || []).filter((t) => !t.id?.startsWith(DEMO_PREFIX));
    if (state.tasksByDate[dk].length === 0) delete state.tasksByDate[dk];
  }
  state.calendarEvents = (state.calendarEvents || []).filter((e) => !e.id?.startsWith(DEMO_PREFIX));
}

function loadState(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      version: STATE_VERSION,
      tasksByDate: {},
      calendarEvents: [],
      ratesCache: null,
      ratesBaseline: null,
      ui: {
        lastViewedBaseDate: '',
        viewOffsetDays: 0,
        calendarMonth: '',
        preferredMonitor: null,
        filesLastPath: '',
        theme: 'dark',
        locale: 'pt-BR'
      }
    };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    version: STATE_VERSION,
    tasksByDate: parsed.tasksByDate || parsed.tasks_by_date || {},
    calendarEvents: parsed.calendarEvents || parsed.calendar_events || [],
    ratesCache: parsed.ratesCache ?? parsed.rates_cache ?? null,
    ratesBaseline: parsed.ratesBaseline ?? parsed.rates_baseline ?? null,
    ui: {
      lastViewedBaseDate:
        parsed.ui?.lastViewedBaseDate ?? parsed.ui?.last_viewed_base_date ?? '',
      viewOffsetDays: parsed.ui?.viewOffsetDays ?? parsed.ui?.view_offset_days ?? 0,
      calendarMonth: parsed.ui?.calendarMonth ?? parsed.ui?.calendar_month ?? '',
      preferredMonitor: parsed.ui?.preferredMonitor ?? parsed.ui?.preferred_monitor ?? null,
      filesLastPath: parsed.ui?.filesLastPath ?? parsed.ui?.files_last_path ?? '',
      theme: parsed.ui?.theme ?? 'dark',
      locale: parsed.ui?.locale ?? 'pt-BR'
    }
  };
}

function mergeDemo(state) {
  stripDemoEntries(state);

  for (const [dateKey, tasks] of Object.entries(TASKS_BY_DATE)) {
    const existing = state.tasksByDate[dateKey] || [];
    state.tasksByDate[dateKey] = [...existing, ...tasks];
  }

  state.calendarEvents = [...state.calendarEvents, ...CALENDAR_EVENTS];

  state.ui.calendarMonth = `${YEAR}-${MONTH}`;
  state.ui.lastViewedBaseDate = `${YEAR}-${MONTH}-22`;
  state.ui.viewOffsetDays = 0;
  state.version = STATE_VERSION;

  return state;
}

function main() {
  const statePath = resolveStatePath();
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const state = mergeDemo(loadState(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const dayCount = Object.keys(TASKS_BY_DATE).length;
  const taskCount = Object.values(TASKS_BY_DATE).reduce((n, list) => n + list.length, 0);

  console.log(`Demo maio ${YEAR} aplicado em:\n  ${statePath}`);
  console.log(`  ${dayCount} dias com tarefas (${taskCount} tarefas)`);
  console.log(`  ${CALENDAR_EVENTS.length} eventos no calendario`);
  console.log(`  UI: calendario ${state.ui.calendarMonth}, execucao ${state.ui.lastViewedBaseDate}`);
  console.log('\nReabra o Focus Dashboard para ver os dados.');
}

main();
