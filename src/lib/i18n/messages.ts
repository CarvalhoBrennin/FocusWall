import type { LocaleId } from '../types/app.js';

export type MessageKey =
  | 'app.loading'
  | 'app.reload'
  | 'settings.title'
  | 'settings.close'
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
  | 'toast.dismiss'
  | 'composer.hint'
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
  | 'shortcuts.navigateMonths';

const messages: Record<LocaleId, Record<MessageKey, string>> = {
  'pt-BR': {
    'app.loading': 'Carregando Focus Dashboard...',
    'app.reload': 'Recarregar',
    'settings.title': 'Configurações',
    'settings.close': 'Fechar',
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
    'toast.dismiss': 'Fechar notificação',
    'composer.hint': 'Atalhos: Enter para adicionar; Ctrl+Enter foca o campo; Alt+setas navega entre dias.',
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
    'shortcuts.navigateMonths': 'Navegar entre meses'
  },
  'en-US': {
    'app.loading': 'Loading Focus Dashboard...',
    'app.reload': 'Reload',
    'settings.title': 'Settings',
    'settings.close': 'Close',
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
    'toast.dismiss': 'Dismiss notification',
    'composer.hint': 'Shortcuts: Enter to add; Ctrl+Enter focuses field; Alt+arrows navigate days.',
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
    'shortcuts.navigateMonths': 'Navigate between months'
  }
};

export function translate(locale: LocaleId, key: MessageKey): string {
  return messages[locale]?.[key] ?? messages['pt-BR'][key] ?? key;
}

export const LOCALE_OPTIONS: { id: LocaleId; label: string }[] = [
  { id: 'pt-BR', label: 'Português (BR)' },
  { id: 'en-US', label: 'English (US)' }
];
