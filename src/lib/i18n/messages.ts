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
  | 'tasks.neural'
  | 'tasks.opencode'
  | 'tasks.vivarium'
  | 'tasks.panelMode'
  | 'tasks.execution'
  | 'tasks.historyNav'
  | 'tasks.prevDay'
  | 'tasks.nextDay'
  | 'tasks.desktop'
  | 'tasks.performance'
  | 'tasks.nowPlaying'
  | 'tasks.knowledge'
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
  | 'tasks.emptyTitle'
  | 'tasks.emptyCopy'
  | 'tasks.emptyAction'
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
  | 'opencode.desktopOnly'
  | 'neural.panelLabel'
  | 'neural.sidebarLabel'
  | 'neural.editorLabel'
  | 'neural.relationsLabel'
  | 'neural.eyebrow'
  | 'neural.newNote'
  | 'neural.search'
  | 'neural.searchPlaceholder'
  | 'neural.statsNotes'
  | 'neural.statsLinks'
  | 'neural.statsOrphans'
  | 'neural.noNotesFound'
  | 'neural.emptyEyebrow'
  | 'neural.emptyTitle'
  | 'neural.emptyBody'
  | 'neural.emptyAction'
  | 'neural.linkTarget'
  | 'neural.insertLink'
  | 'neural.saving'
  | 'neural.noNoteSelected'
  | 'neural.savedLocally'
  | 'neural.updatedAt'
  | 'neural.noteTitle'
  | 'neural.content'
  | 'neural.contentPlaceholder'
  | 'neural.outgoingLinks'
  | 'neural.localGraph'
  | 'neural.nodes'
  | 'neural.noOutgoingLinks'
  | 'neural.createLink'
  | 'neural.backlinks'
  | 'neural.noBacklinks'
  | 'neural.unlinkedMentions'
  | 'neural.noUnlinkedMentions'
  | 'neural.suggestions'
  | 'neural.noSuggestions'
  | 'neural.linkMention'
  | 'neural.deleteNote'
  | 'neural.deleteConfirmTitle'
  | 'neural.deleteConfirmBody'
  | 'neural.deleteConfirmLabel'
  | 'neural.toastDeleted'
  | 'neural.toastMentionLinked'
  | 'neural.toastNoteCreated'
  | 'neural.toastTitleRequired'
  | 'neural.noteEmpty'
  | 'neural.defaultNoteTitle'
  | 'neural.defaultNoteContent'
  | 'neural.status.saved'
  | 'neural.status.updated'
  | 'neural.status.deleted'
  | 'neural.status.saveFailedAdd'
  | 'neural.status.saveFailedUpdate'
  | 'neural.status.saveFailedDelete'
  | 'neural.graph.label'
  | 'neural.graph.empty'
  | 'neural.graph.noConnections'
  | 'neural.graph.createNote'
  | 'neural.graph.openNote'
  | 'neural.graph.untitled';

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
    'tasks.neural': 'Neural',
    'tasks.opencode': 'OpenCode',
    'tasks.vivarium': 'Vivarium',
    'tasks.panelMode': 'Modo do painel',
    'tasks.execution': 'Execução',
    'tasks.historyNav': 'Histórico rápido',
    'tasks.prevDay': 'Dia anterior',
    'tasks.nextDay': 'Dia seguinte',
    'tasks.desktop': 'Desktop',
    'tasks.performance': 'Desempenho',
    'tasks.nowPlaying': 'Tocando agora',
    'tasks.knowledge': 'Conhecimento conectado',
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
    'tasks.emptyTitle': 'Quadro aberto.',
    'tasks.emptyCopy': 'Clique aqui ou registre a primeira tarefa.',
    'tasks.emptyAction': 'Adicionar primeira tarefa',
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
    'opencode.desktopOnly': 'OpenCode CLI só está disponível no desktop (Tauri).',
    'neural.panelLabel': 'Neural — notas conectadas',
    'neural.sidebarLabel': 'Notas neurais',
    'neural.editorLabel': 'Editor da nota neural',
    'neural.relationsLabel': 'Backlinks e menções',
    'neural.eyebrow': 'Knowledge graph',
    'neural.newNote': 'Nova',
    'neural.search': 'Busca rápida',
    'neural.searchPlaceholder': 'Título, texto ou relação...',
    'neural.statsNotes': 'notas',
    'neural.statsLinks': 'links',
    'neural.statsOrphans': 'soltas',
    'neural.noNotesFound': 'Nenhuma nota encontrada.',
    'neural.emptyEyebrow': 'Segundo cérebro',
    'neural.emptyTitle': 'Comece com uma nota e conecte ideias.',
    'neural.emptyBody':
      'Use links no formato [[Nome da nota]]. A aba Neural mostra backlinks, menções ainda não vinculadas e um grafo local das relações.',
    'neural.emptyAction': 'Criar primeira nota',
    'neural.linkTarget': 'Nota para inserir como link',
    'neural.insertLink': 'Inserir [[link]]',
    'neural.saving': 'Salvando…',
    'neural.noNoteSelected': 'Nenhuma nota selecionada.',
    'neural.savedLocally': 'Salva localmente.',
    'neural.updatedAt': 'Atualizada {date}.',
    'neural.noteTitle': 'Título da nota',
    'neural.content': 'Conteúdo',
    'neural.contentPlaceholder':
      'Escreva notas, projetos, ideias e referências. Exemplo: relacione com [[Outra nota]].',
    'neural.outgoingLinks': 'Links de saída',
    'neural.localGraph': 'Grafo local',
    'neural.nodes': 'nós',
    'neural.noOutgoingLinks': 'Nenhum link interno no texto.',
    'neural.createLink': 'Criar {title}',
    'neural.backlinks': 'Backlinks',
    'neural.noBacklinks': 'Nenhuma nota aponta para esta.',
    'neural.unlinkedMentions': 'Menções não vinculadas',
    'neural.noUnlinkedMentions': 'Nenhuma menção solta ao título atual.',
    'neural.suggestions': 'Sugestões nesta nota',
    'neural.noSuggestions': 'Nenhuma nota existente foi citada sem link.',
    'neural.linkMention': 'Linkar {title}',
    'neural.deleteNote': 'Excluir nota',
    'neural.deleteConfirmTitle': 'Excluir nota neural',
    'neural.deleteConfirmBody':
      'A nota "{title}" será removida. Links apontando para ela permanecerão como texto no conteúdo das outras notas.',
    'neural.deleteConfirmLabel': 'Excluir',
    'neural.toastDeleted': 'Nota neural excluída.',
    'neural.toastMentionLinked': 'Menção convertida em link interno.',
    'neural.toastNoteCreated': 'Nota criada a partir do link interno.',
    'neural.toastTitleRequired': 'O título da nota não pode ficar vazio.',
    'neural.noteEmpty': 'Nota vazia',
    'neural.defaultNoteTitle': 'Nova nota',
    'neural.defaultNoteContent': 'Use [[Nome da nota]] para criar conexões internas.\n\n',
    'neural.status.saved': 'Nota neural salva localmente.',
    'neural.status.updated': 'Nota neural atualizada localmente.',
    'neural.status.deleted': 'Nota neural excluída.',
    'neural.status.saveFailedAdd': 'Não foi possível salvar a nota neural.',
    'neural.status.saveFailedUpdate': 'Não foi possível atualizar a nota neural.',
    'neural.status.saveFailedDelete': 'Não foi possível excluir a nota neural.',
    'neural.graph.label': 'Grafo local da nota atual',
    'neural.graph.empty': 'Crie uma nota para iniciar o grafo.',
    'neural.graph.noConnections': 'Sem conexões ainda. Use [[Nome da nota]] no texto.',
    'neural.graph.createNote': 'Criar nota {title}',
    'neural.graph.openNote': 'Abrir {title}',
    'neural.graph.untitled': 'Sem título'
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
    'tasks.neural': 'Neural',
    'tasks.opencode': 'OpenCode',
    'tasks.vivarium': 'Vivarium',
    'tasks.panelMode': 'Panel mode',
    'tasks.execution': 'Execution',
    'tasks.historyNav': 'Quick history',
    'tasks.prevDay': 'Previous day',
    'tasks.nextDay': 'Next day',
    'tasks.desktop': 'Desktop',
    'tasks.performance': 'Performance',
    'tasks.nowPlaying': 'Now playing',
    'tasks.knowledge': 'Connected knowledge',
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
    'tasks.emptyTitle': 'Board is open.',
    'tasks.emptyCopy': 'Click here or add the first task.',
    'tasks.emptyAction': 'Add first task',
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
    'opencode.desktopOnly': 'OpenCode CLI is only available on desktop (Tauri).',
    'neural.panelLabel': 'Neural — connected notes',
    'neural.sidebarLabel': 'Neural notes',
    'neural.editorLabel': 'Neural note editor',
    'neural.relationsLabel': 'Backlinks and mentions',
    'neural.eyebrow': 'Knowledge graph',
    'neural.newNote': 'New',
    'neural.search': 'Quick search',
    'neural.searchPlaceholder': 'Title, body, or relation...',
    'neural.statsNotes': 'notes',
    'neural.statsLinks': 'links',
    'neural.statsOrphans': 'orphan',
    'neural.noNotesFound': 'No notes found.',
    'neural.emptyEyebrow': 'Second brain',
    'neural.emptyTitle': 'Start with one note and connect ideas.',
    'neural.emptyBody':
      'Use links like [[Note name]]. The Neural tab shows backlinks, unlinked mentions, and a local graph of relations.',
    'neural.emptyAction': 'Create first note',
    'neural.linkTarget': 'Note to insert as link',
    'neural.insertLink': 'Insert [[link]]',
    'neural.saving': 'Saving…',
    'neural.noNoteSelected': 'No note selected.',
    'neural.savedLocally': 'Saved locally.',
    'neural.updatedAt': 'Updated {date}.',
    'neural.noteTitle': 'Note title',
    'neural.content': 'Content',
    'neural.contentPlaceholder':
      'Write notes, projects, ideas, and references. Example: link to [[Another note]].',
    'neural.outgoingLinks': 'Outgoing links',
    'neural.localGraph': 'Local graph',
    'neural.nodes': 'nodes',
    'neural.noOutgoingLinks': 'No internal links in the text.',
    'neural.createLink': 'Create {title}',
    'neural.backlinks': 'Backlinks',
    'neural.noBacklinks': 'No note links to this one.',
    'neural.unlinkedMentions': 'Unlinked mentions',
    'neural.noUnlinkedMentions': 'No loose mention of the current title.',
    'neural.suggestions': 'Suggestions in this note',
    'neural.noSuggestions': 'No existing note was cited without a link.',
    'neural.linkMention': 'Link {title}',
    'neural.deleteNote': 'Delete note',
    'neural.deleteConfirmTitle': 'Delete neural note',
    'neural.deleteConfirmBody':
      'The note "{title}" will be removed. Links pointing to it will remain as text in other notes.',
    'neural.deleteConfirmLabel': 'Delete',
    'neural.toastDeleted': 'Neural note deleted.',
    'neural.toastMentionLinked': 'Mention converted to an internal link.',
    'neural.toastNoteCreated': 'Note created from the internal link.',
    'neural.toastTitleRequired': 'The note title cannot be empty.',
    'neural.noteEmpty': 'Empty note',
    'neural.defaultNoteTitle': 'New note',
    'neural.defaultNoteContent': 'Use [[Note name]] to create internal connections.\n\n',
    'neural.status.saved': 'Neural note saved locally.',
    'neural.status.updated': 'Neural note updated locally.',
    'neural.status.deleted': 'Neural note deleted.',
    'neural.status.saveFailedAdd': 'Could not save the neural note.',
    'neural.status.saveFailedUpdate': 'Could not update the neural note.',
    'neural.status.saveFailedDelete': 'Could not delete the neural note.',
    'neural.graph.label': 'Local graph for the current note',
    'neural.graph.empty': 'Create a note to start the graph.',
    'neural.graph.noConnections': 'No connections yet. Use [[Note name]] in the text.',
    'neural.graph.createNote': 'Create note {title}',
    'neural.graph.openNote': 'Open {title}',
    'neural.graph.untitled': 'Untitled'
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
