import type { LocaleId } from '../types/app.js';

export type MessageKey =
  | 'app.loading'
  | 'app.reload'
  | 'app.fatalError'
  | 'app.unhandledRejection'
  | 'app.shellLabel'
  | 'settings.title'
  | 'settings.close'
  | 'settings.open'
  | 'settings.exportBackup'
  | 'settings.data'
  | 'settings.theme'
  | 'settings.locale'
  | 'settings.updates'
  | 'settings.checkUpdates'
  | 'theme.dark'
  | 'theme.light'
  | 'theme.olive'
  | 'startup.title'
  | 'startup.label'
  | 'startup.active'
  | 'startup.inactive'
  | 'startup.loading'
  | 'startup.browserUnavailable'
  | 'toast.dismiss'
  | 'toast.undo'
  | 'composer.hint'
  | 'composer.newEntry'
  | 'composer.title'
  | 'composer.inputLabel'
  | 'composer.placeholder'
  | 'composer.submit'
  | 'composer.summary'
  | 'composer.percentDone'
  | 'composer.blankDay'
  | 'composer.completedCount'
  | 'composer.totalOnBoard'
  | 'tasks.today'
  | 'tasks.yesterday'
  | 'tasks.executionPanel'
  | 'tasks.executionArchive'
  | 'tasks.calendar'
  | 'tasks.files'
  | 'tasks.system'
  | 'tasks.media'
  | 'tasks.panelMode'
  | 'tasks.execution'
  | 'tasks.historyNav'
  | 'tasks.prevDay'
  | 'tasks.nextDay'
  | 'tasks.desktop'
  | 'tasks.performance'
  | 'tasks.nowPlaying'
  | 'tasks.listArea'
  | 'tasks.listLabel'
  | 'tasks.pagination'
  | 'tasks.showing'
  | 'tasks.range'
  | 'tasks.prevPage'
  | 'tasks.nextPage'
  | 'tasks.markPending'
  | 'tasks.markComplete'
  | 'tasks.edit'
  | 'tasks.changePriority'
  | 'tasks.pinned'
  | 'tasks.completed'
  | 'tasks.open'
  | 'tasks.moveUp'
  | 'tasks.moveDown'
  | 'tasks.delete'
  | 'tasks.deleted'
  | 'tasks.added'
  | 'priority.high'
  | 'priority.medium'
  | 'priority.low'
  | 'infoRail.label'
  | 'clock.localTime'
  | 'rates.exchange'
  | 'rates.title'
  | 'rates.subtitle'
  | 'rates.listLabel'
  | 'rates.status.live'
  | 'rates.status.cached'
  | 'rates.status.unavailable'
  | 'rates.status.updating'
  | 'rates.movement.up'
  | 'rates.movement.down'
  | 'rates.movement.flat'
  | 'rates.stable'
  | 'rates.inDay'
  | 'rates.sinceOpen'
  | 'rates.sinceRefresh'
  | 'rates.before'
  | 'rates.previousQuote'
  | 'monitor.title'
  | 'monitor.loading'
  | 'monitor.browserUnavailable'
  | 'monitor.primary'
  | 'monitor.current'
  | 'monitor.unknown'
  | 'modal.cancel'
  | 'updates.checking'
  | 'updates.available'
  | 'updates.none'
  | 'updates.error'
  | 'updates.disabled'
  | 'updates.install'
  | 'toast.close'
  | 'shortcuts.title'
  | 'shortcuts.addTask'
  | 'shortcuts.focusComposer'
  | 'shortcuts.navigateDays'
  | 'shortcuts.navigateMonths'
  | 'shortcuts.closeModals'
  | 'shortcuts.calendarNav'
  | 'shortcuts.showHelp'
  | 'opencode.notFound'
  | 'opencode.invalidDir'
  | 'opencode.spawnFailed'
  | 'opencode.exitedUnexpectedly'
  | 'opencode.starting'
  | 'opencode.desktopOnly';

const messages: Record<LocaleId, Record<MessageKey, string>> = {
  'pt-BR': {
    'app.loading': 'Carregando Focus Dashboard...',
    'app.reload': 'Recarregar',
    'app.fatalError': 'Erro inesperado no aplicativo.',
    'app.unhandledRejection': 'Promise rejeitada sem tratamento.',
    'app.shellLabel': 'Painel pessoal de produtividade',
    'settings.title': 'Configurações',
    'settings.close': 'Fechar',
    'settings.open': 'Configurações',
    'settings.exportBackup': 'Exportar backup JSON',
    'settings.data': 'Dados',
    'settings.theme': 'Tema',
    'settings.locale': 'Idioma',
    'settings.updates': 'Atualizações',
    'settings.checkUpdates': 'Verificar atualizações',
    'theme.dark': 'Escuro',
    'theme.light': 'Claro',
    'theme.olive': 'Oliva',
    'startup.title': 'Inicialização',
    'startup.label': 'Iniciar junto com o Windows',
    'startup.active': 'Ativo',
    'startup.inactive': 'Inativo',
    'startup.loading': 'Carregando...',
    'startup.browserUnavailable': 'API de autostart indisponível no modo navegador.',
    'toast.dismiss': 'Fechar notificação',
    'toast.undo': 'Desfazer',
    'composer.hint': 'Atalhos: Enter para adicionar; Ctrl+Enter foca o campo; Alt+setas navega entre dias.',
    'composer.newEntry': 'Nova entrada',
    'composer.title': 'Defina o próximo movimento.',
    'composer.inputLabel': 'Nova tarefa',
    'composer.placeholder': 'Adicionar uma tarefa importante...',
    'composer.submit': 'Registrar',
    'composer.summary': 'Resumo',
    'composer.percentDone': '{pct}% do quadro concluído.',
    'composer.blankDay': 'O dia ainda está em branco.',
    'composer.completedCount': '{done} de {total} concluídas',
    'composer.totalOnBoard': '{total} no quadro',
    'tasks.today': 'Hoje',
    'tasks.yesterday': 'Ontem',
    'tasks.executionPanel': 'Painel de execução',
    'tasks.executionArchive': 'Arquivo de execução',
    'tasks.calendar': 'Calendário',
    'tasks.files': 'Arquivos',
    'tasks.system': 'Sistema',
    'tasks.media': 'Mídia',
    'tasks.panelMode': 'Modo do painel',
    'tasks.execution': 'Execução',
    'tasks.historyNav': 'Histórico rápido',
    'tasks.prevDay': 'Dia anterior',
    'tasks.nextDay': 'Dia seguinte',
    'tasks.desktop': 'Desktop',
    'tasks.performance': 'Desempenho',
    'tasks.nowPlaying': 'Tocando agora',
    'tasks.listArea': 'Área principal de tarefas',
    'tasks.listLabel': 'Lista de tarefas do dia',
    'tasks.pagination': 'Navegação entre páginas',
    'tasks.showing': 'Mostrando',
    'tasks.range': '{start}-{end} de {total}',
    'tasks.prevPage': 'Página anterior',
    'tasks.nextPage': 'Próxima página',
    'tasks.markPending': 'Marcar como pendente',
    'tasks.markComplete': 'Marcar como concluída',
    'tasks.edit': 'Editar tarefa',
    'tasks.changePriority': 'Alterar prioridade',
    'tasks.pinned': 'Fixada',
    'tasks.completed': 'Concluída',
    'tasks.open': 'Em aberto',
    'tasks.moveUp': 'Subir tarefa',
    'tasks.moveDown': 'Descer tarefa',
    'tasks.delete': 'Excluir tarefa',
    'tasks.deleted': 'Tarefa excluída',
    'tasks.added': 'Tarefa adicionada',
    'priority.high': 'Alta',
    'priority.medium': 'Média',
    'priority.low': 'Baixa',
    'infoRail.label': 'Informações do dia',
    'clock.localTime': 'Tempo local',
    'rates.exchange': 'Câmbio',
    'rates.title': 'Câmbio BRL',
    'rates.subtitle': 'USD-BRL e EUR-BRL.',
    'rates.listLabel': 'Cotações do dia',
    'rates.status.live': 'ao vivo',
    'rates.status.cached': 'em cache',
    'rates.status.unavailable': 'indisponível',
    'rates.status.updating': 'atualizando',
    'rates.movement.up': 'Subindo',
    'rates.movement.down': 'Caindo',
    'rates.movement.flat': 'Estável',
    'rates.stable': 'estável',
    'rates.inDay': 'no dia',
    'rates.sinceOpen': 'desde abertura',
    'rates.sinceRefresh': 'desde última atualização',
    'rates.before': 'Antes: R$ {value}',
    'rates.previousQuote': 'Cotação anterior em reais',
    'monitor.title': 'Monitor',
    'monitor.loading': 'Carregando monitores...',
    'monitor.browserUnavailable': 'API de monitor indisponível no modo navegador.',
    'monitor.primary': ' (Principal)',
    'monitor.current': 'Atual',
    'monitor.unknown': 'Monitor',
    'modal.cancel': 'Cancelar',
    'updates.checking': 'Verificando atualizações...',
    'updates.available': 'Atualização disponível.',
    'updates.none': 'Você está na versão mais recente.',
    'updates.error': 'Não foi possível verificar atualizações.',
    'updates.disabled': 'Atualizações automáticas ainda não configuradas nesta build.',
    'updates.install': 'Instalar atualização',
    'toast.close': 'Fechar notificação',
    'shortcuts.title': 'Atalhos de teclado',
    'shortcuts.addTask': 'Adicionar tarefa',
    'shortcuts.focusComposer': 'Focar campo de tarefa',
    'shortcuts.navigateDays': 'Navegar entre dias',
    'shortcuts.navigateMonths': 'Navegar entre meses',
    'shortcuts.closeModals': 'Fechar modais',
    'shortcuts.calendarNav': '← / → (calendário)',
    'shortcuts.showHelp': 'Mostrar atalhos',
    'opencode.notFound': 'OpenCode não encontrado. Instale com: npm i -g opencode-cli ou configure o PATH.',
    'opencode.invalidDir': 'Diretório de trabalho inválido.',
    'opencode.spawnFailed': 'Falha ao iniciar OpenCode.',
    'opencode.exitedUnexpectedly': 'OpenCode encerrou inesperadamente.',
    'opencode.starting': 'Iniciando...',
    'opencode.desktopOnly': 'OpenCode CLI só está disponível no desktop (Tauri).'
  },
  'en-US': {
    'app.loading': 'Loading Focus Dashboard...',
    'app.reload': 'Reload',
    'app.fatalError': 'Unexpected application error.',
    'app.unhandledRejection': 'Unhandled promise rejection.',
    'app.shellLabel': 'Personal productivity dashboard',
    'settings.title': 'Settings',
    'settings.close': 'Close',
    'settings.open': 'Settings',
    'settings.exportBackup': 'Export JSON backup',
    'settings.data': 'Data',
    'settings.theme': 'Theme',
    'settings.locale': 'Language',
    'settings.updates': 'Updates',
    'settings.checkUpdates': 'Check for updates',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.olive': 'Olive',
    'startup.title': 'Startup',
    'startup.label': 'Launch with Windows',
    'startup.active': 'Active',
    'startup.inactive': 'Inactive',
    'startup.loading': 'Loading...',
    'startup.browserUnavailable': 'Autostart API unavailable in browser mode.',
    'toast.dismiss': 'Dismiss notification',
    'toast.undo': 'Undo',
    'composer.hint': 'Shortcuts: Enter to add; Ctrl+Enter focuses field; Alt+arrows navigate days.',
    'composer.newEntry': 'New entry',
    'composer.title': 'Define the next move.',
    'composer.inputLabel': 'New task',
    'composer.placeholder': 'Add an important task...',
    'composer.submit': 'Add',
    'composer.summary': 'Summary',
    'composer.percentDone': '{pct}% of the board completed.',
    'composer.blankDay': 'The day is still blank.',
    'composer.completedCount': '{done} of {total} completed',
    'composer.totalOnBoard': '{total} on the board',
    'tasks.today': 'Today',
    'tasks.yesterday': 'Yesterday',
    'tasks.executionPanel': 'Execution panel',
    'tasks.executionArchive': 'Execution archive',
    'tasks.calendar': 'Calendar',
    'tasks.files': 'Files',
    'tasks.system': 'System',
    'tasks.media': 'Media',
    'tasks.panelMode': 'Panel mode',
    'tasks.execution': 'Execution',
    'tasks.historyNav': 'Quick history',
    'tasks.prevDay': 'Previous day',
    'tasks.nextDay': 'Next day',
    'tasks.desktop': 'Desktop',
    'tasks.performance': 'Performance',
    'tasks.nowPlaying': 'Now playing',
    'tasks.listArea': 'Main task area',
    'tasks.listLabel': 'Today\'s task list',
    'tasks.pagination': 'Page navigation',
    'tasks.showing': 'Showing',
    'tasks.range': '{start}-{end} of {total}',
    'tasks.prevPage': 'Previous page',
    'tasks.nextPage': 'Next page',
    'tasks.markPending': 'Mark as pending',
    'tasks.markComplete': 'Mark as completed',
    'tasks.edit': 'Edit task',
    'tasks.changePriority': 'Change priority',
    'tasks.pinned': 'Pinned',
    'tasks.completed': 'Completed',
    'tasks.open': 'Open',
    'tasks.moveUp': 'Move task up',
    'tasks.moveDown': 'Move task down',
    'tasks.delete': 'Delete task',
    'tasks.deleted': 'Task deleted',
    'tasks.added': 'Task added',
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',
    'infoRail.label': 'Daily information',
    'clock.localTime': 'Local time',
    'rates.exchange': 'Exchange',
    'rates.title': 'BRL exchange',
    'rates.subtitle': 'USD-BRL and EUR-BRL.',
    'rates.listLabel': 'Today\'s rates',
    'rates.status.live': 'live',
    'rates.status.cached': 'cached',
    'rates.status.unavailable': 'unavailable',
    'rates.status.updating': 'updating',
    'rates.movement.up': 'Rising',
    'rates.movement.down': 'Falling',
    'rates.movement.flat': 'Stable',
    'rates.stable': 'stable',
    'rates.inDay': 'today',
    'rates.sinceOpen': 'since open',
    'rates.sinceRefresh': 'since last update',
    'rates.before': 'Before: R$ {value}',
    'rates.previousQuote': 'Previous quote in BRL',
    'monitor.title': 'Monitor',
    'monitor.loading': 'Loading monitors...',
    'monitor.browserUnavailable': 'Monitor API unavailable in browser mode.',
    'monitor.primary': ' (Primary)',
    'monitor.current': 'Current',
    'monitor.unknown': 'Monitor',
    'modal.cancel': 'Cancel',
    'updates.checking': 'Checking for updates...',
    'updates.available': 'Update available.',
    'updates.none': 'You are on the latest version.',
    'updates.error': 'Could not check for updates.',
    'updates.disabled': 'Automatic updates are not configured in this build yet.',
    'updates.install': 'Install update',
    'toast.close': 'Dismiss notification',
    'shortcuts.title': 'Keyboard shortcuts',
    'shortcuts.addTask': 'Add task',
    'shortcuts.focusComposer': 'Focus task field',
    'shortcuts.navigateDays': 'Navigate between days',
    'shortcuts.navigateMonths': 'Navigate between months',
    'shortcuts.closeModals': 'Close modals',
    'shortcuts.calendarNav': '← / → (calendar)',
    'shortcuts.showHelp': 'Show shortcuts',
    'opencode.notFound': 'OpenCode not found. Install with: npm i -g opencode-cli or configure your PATH.',
    'opencode.invalidDir': 'Invalid working directory.',
    'opencode.spawnFailed': 'Failed to start OpenCode.',
    'opencode.exitedUnexpectedly': 'OpenCode exited unexpectedly.',
    'opencode.starting': 'Starting...',
    'opencode.desktopOnly': 'OpenCode CLI is only available on desktop (Tauri).'
  }
};

export function translate(locale: LocaleId, key: MessageKey): string {
  return messages[locale]?.[key] ?? messages['pt-BR'][key] ?? key;
}

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
}

export const LOCALE_OPTIONS: { id: LocaleId; label: string }[] = [
  { id: 'pt-BR', label: 'Português (BR)' },
  { id: 'en-US', label: 'English (US)' }
];
