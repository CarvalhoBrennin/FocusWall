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
  | 'settings.wallbot'
  | 'settings.wallbotModel'
  | 'settings.wallbotModelAuto'
  | 'settings.wallbotModelHelp'
  | 'settings.wallbotModelLoading'
  | 'settings.wallbotModelOffline'
  | 'settings.wallbotModelNoModels'
  | 'settings.wallbotModelRefresh'
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
  | 'tasks.assistant'
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
  | 'tasks.radar'
  | 'tasks.currentContext'
  | 'music.accountConnected'
  | 'music.accountDisconnected'
  | 'music.authorizationBrowser'
  | 'music.backToLibrary'
  | 'music.configurationBody'
  | 'music.configurationEyebrow'
  | 'music.configurationTitle'
  | 'music.connectAction'
  | 'music.connectBody'
  | 'music.connectTitle'
  | 'music.connected'
  | 'music.connecting'
  | 'music.connectingPlayer'
  | 'music.desktopBody'
  | 'music.desktopEyebrow'
  | 'music.desktopTitle'
  | 'music.dismissMessage'
  | 'music.emptyPlaylist'
  | 'music.emptyPlaylistBody'
  | 'music.filteredResult'
  | 'music.libraryEmpty'
  | 'music.libraryEmptyBody'
  | 'music.libraryLabel'
  | 'music.libraryRefreshing'
  | 'music.libraryRefreshingBody'
  | 'music.librarySubtitle'
  | 'music.libraryTitle'
  | 'music.loadingTracks'
  | 'music.loadingTracksBody'
  | 'music.miniIdleTitle'
  | 'music.miniPlayerLabel'
  | 'music.mute'
  | 'music.next'
  | 'music.nextTrack'
  | 'music.noActivePlayback'
  | 'music.noTrackSelected'
  | 'music.noTrackSelectedBody'
  | 'music.notConnected'
  | 'music.nowPlaying'
  | 'music.officialPlayerLabel'
  | 'music.openPlaylist'
  | 'music.panelLabel'
  | 'music.pause'
  | 'music.play'
  | 'music.playAll'
  | 'music.playTrack'
  | 'music.playbackControls'
  | 'music.playbackFailed'
  | 'music.playerApiInitFailed'
  | 'music.playerAutoplayBlocked'
  | 'music.playerConnecting'
  | 'music.playerControlFailed'
  | 'music.playerEmbedBlocked'
  | 'music.playerGenericError'
  | 'music.playerIdentityRejected'
  | 'music.playerInvalidTrack'
  | 'music.playerLoadFailed'
  | 'music.playerLoadFailedShort'
  | 'music.playerLoadTimeout'
  | 'music.playerLoading'
  | 'music.playerLoopFailed'
  | 'music.playerMuteFailed'
  | 'music.playerNextFailed'
  | 'music.playerPaused'
  | 'music.playerPlaying'
  | 'music.playerPreviousFailed'
  | 'music.playerQueueEnd'
  | 'music.playerQueueFallback'
  | 'music.playerQueueLoadFailed'
  | 'music.playerRejectedTrack'
  | 'music.playerRestartFailed'
  | 'music.playerSeekFailed'
  | 'music.playerShuffleFailed'
  | 'music.playerSkippingNext'
  | 'music.playerStartFailed'
  | 'music.playerTrackLoadFailed'
  | 'music.playerUnavailableTrack'
  | 'music.playerVolumeFailed'
  | 'music.playerWaiting'
  | 'music.playlist'
  | 'music.playlistEyebrow'
  | 'music.playlists'
  | 'music.preparingPlayer'
  | 'music.previous'
  | 'music.previousTrack'
  | 'music.progressA11y'
  | 'music.queueEyebrow'
  | 'music.queueLabel'
  | 'music.refreshPlaylists'
  | 'music.refreshTracks'
  | 'music.repeatQueue'
  | 'music.retry'
  | 'music.searchEmpty'
  | 'music.searchEmptyBody'
  | 'music.searchPlaylists'
  | 'music.searchTracks'
  | 'music.selectTrack'
  | 'music.selectedPlaylistLabel'
  | 'music.settingsConnect'
  | 'music.settingsDesktopCredential'
  | 'music.settingsDisconnect'
  | 'music.settingsDisconnecting'
  | 'music.settingsEyebrow'
  | 'music.settingsKeepSecret'
  | 'music.settingsLoading'
  | 'music.settingsOpenApi'
  | 'music.settingsOpenOauth'
  | 'music.settingsPasteSecret'
  | 'music.settingsSave'
  | 'music.settingsSaved'
  | 'music.settingsSaving'
  | 'music.settingsSecretStored'
  | 'music.settingsSecurity'
  | 'music.settingsTitle'
  | 'music.shuffle'
  | 'music.syncingBody'
  | 'music.syncingEyebrow'
  | 'music.syncingTitle'
  | 'music.toggleLoop'
  | 'music.toggleShuffle'
  | 'music.track'
  | 'music.trackPosition'
  | 'music.trackSearchEmpty'
  | 'music.trackSearchEmptyBody'
  | 'music.tracks'
  | 'music.unmute'
  | 'music.videoLabel'
  | 'music.volume'
  | 'music.youtubeBrand'
  | 'music.youtubeEyebrow'
  | 'radar.panelLabel'
  | 'radar.refresh'
  | 'radar.refreshing'
  | 'radar.updatedAt'
  | 'radar.cachedAt'
  | 'radar.stale'
  | 'radar.partial'
  | 'radar.fixture'
  | 'radar.weather'
  | 'radar.news'
  | 'radar.newsEyebrow'
  | 'radar.newsCount'
  | 'radar.location'
  | 'radar.changeLocation'
  | 'radar.removeLocation'
  | 'radar.locationRequiredTitle'
  | 'radar.locationRequiredBody'
  | 'radar.locationSearchLabel'
  | 'radar.locationSearchPlaceholder'
  | 'radar.locationSearchEmpty'
  | 'radar.locationSearchError'
  | 'radar.temperature'
  | 'radar.feelsLike'
  | 'radar.humidity'
  | 'radar.precipitation'
  | 'radar.wind'
  | 'radar.minimum'
  | 'radar.maximum'
  | 'radar.nextHours'
  | 'radar.hourlyA11y'
  | 'radar.category.all'
  | 'radar.category.brasil'
  | 'radar.category.technology'
  | 'radar.category.development'
  | 'radar.category.security'
  | 'radar.category.business'
  | 'radar.category.science'
  | 'radar.category.world'
  | 'radar.relatedCount'
  | 'radar.previewLoading'
  | 'radar.previewError'
  | 'radar.closePreview'
  | 'radar.openInBrowser'
  | 'radar.openUnavailable'
  | 'radar.relatedArticles'
  | 'radar.sevenDays'
  | 'radar.estimateBadge'
  | 'radar.alerts'
  | 'radar.alert.heavyRain'
  | 'radar.alert.storm'
  | 'radar.alert.strongWind'
  | 'radar.alert.highHeat'
  | 'radar.alert.intenseCold'
  | 'radar.alert.lowHumidity'
  | 'radar.alert.veryHighUv'
  | 'radar.newsEmpty'
  | 'radar.newsUnavailable'
  | 'radar.weatherUnavailable'
  | 'radar.usingCachedData'
  | 'radar.openArticle'
  | 'radar.openArticleError'
  | 'radar.source'
  | 'radar.attributionWeather'
  | 'radar.attributionNews'
  | 'radar.relative.now'
  | 'radar.relative.minutes'
  | 'radar.relative.hours'
  | 'radar.relative.days'
  | 'radar.condition.clear'
  | 'radar.condition.mainlyClear'
  | 'radar.condition.partlyCloudy'
  | 'radar.condition.overcast'
  | 'radar.condition.fog'
  | 'radar.condition.drizzle'
  | 'radar.condition.rain'
  | 'radar.condition.snow'
  | 'radar.condition.showers'
  | 'radar.condition.thunderstorm'
  | 'radar.condition.unknown'
  | 'radar.loadFailed'
  | 'radar.refreshFailed'
  | 'radar.openFailed'
  | 'radar.statusReady'
  | 'radar.statusLoading'
  | 'radar.statusError'
  | 'radar.locationResults'
  | 'radar.closeLocation'
  | 'radar.retry'
  | 'radar.noPublishedDate'
  | 'radar.preferencesSaveFailed'
  | 'radar.refreshFailedUsingCache'
  | 'radar.refreshCooldown'
  | 'radar.refreshCooldownUntil'
  | 'radar.locationSaveError'
  | 'radar.locationResultsCount'
  | 'radar.enabledCategories'
  | 'radar.categorySaveError'
  | 'radar.personalization'
  | 'radar.personalizationHelp'
  | 'radar.followedTopics'
  | 'radar.blockedTopics'
  | 'radar.preferredSources'
  | 'radar.mutedSources'
  | 'radar.tickerSymbols'
  | 'radar.preferencePlaceholder'
  | 'radar.savePreferences'
  | 'radar.loadMore'
  | 'radar.partialSourceWarning'
  | 'radar.imagesUnavailable'
  | 'radar.cacheWriteFailed'
  | 'radar.cacheReadFailed'
  | 'radar.refreshFailedNoData'
  | 'radar.gusts'
  | 'radar.pressure'
  | 'radar.uvIndex'
  | 'radar.sunrise'
  | 'radar.sunset'
  | 'radar.ticker'
  | 'radar.quote.ptax'
  | 'radar.quote.spot'
  | 'radar.quote.estimate'
  | 'radar.quote.event'
  | 'system.loading'
  | 'system.desktopOnly'
  | 'system.paused'
  | 'system.pausedTitle'
  | 'system.pausedBody'
  | 'system.collectionFailed'
  | 'system.errorTitle'
  | 'system.loadFailed'
  | 'system.retry'
  | 'system.snapshotReady'
  | 'system.partialSnapshot'
  | 'system.partialDetails'
  | 'system.capturedAt'
  | 'system.overview'
  | 'system.cpu'
  | 'system.memory'
  | 'system.disk'
  | 'system.network'
  | 'system.gpu'
  | 'system.unavailable'
  | 'system.noData'
  | 'system.logicalProcessors'
  | 'system.hardware'
  | 'system.processor'
  | 'system.frequency'
  | 'system.physicalCores'
  | 'system.availableMemory'
  | 'system.storage'
  | 'system.disks'
  | 'system.read'
  | 'system.write'
  | 'system.noDiskData'
  | 'system.connectivity'
  | 'system.download'
  | 'system.upload'
  | 'system.noNetworkData'
  | 'system.graphics'
  | 'system.usage'
  | 'system.dedicatedMemory'
  | 'system.noGpuData'
  | 'system.machine'
  | 'system.operatingSystem'
  | 'system.uptime'
  | 'system.totalMemory'
  | 'system.sensors'
  | 'system.temperatures'
  | 'system.activity'
  | 'system.processes'
  | 'system.processCount'
  | 'system.processCountLimited'
  | 'system.processSearchScope'
  | 'system.searchProcesses'
  | 'system.searchPlaceholder'
  | 'system.noProcesses'
  | 'system.process'
  | 'system.type'
  | 'system.application'
  | 'system.systemProcess'
  | 'tasks.nowPlaying'
  | 'tasks.operator'
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
  | 'rates.title'
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
  | 'assistant.panelLabel'
  | 'assistant.you'
  | 'assistant.name'
  | 'assistant.refresh'
  | 'assistant.clearChat'
  | 'assistant.emptyTitle'
  | 'assistant.emptyBody'
  | 'assistant.inputLabel'
  | 'assistant.placeholder'
  | 'assistant.composerHint'
  | 'assistant.send'
  | 'assistant.sending'
  | 'assistant.cancel'
  | 'assistant.cancelled'
  | 'assistant.offline'
  | 'assistant.startEyebrow'
  | 'assistant.startTitle'
  | 'assistant.startBody'
  | 'assistant.startButton'
  | 'assistant.starting'
  | 'assistant.startOk'
  | 'assistant.modelMissingEyebrow'
  | 'assistant.modelMissingTitle'
  | 'assistant.modelMissingBody'
  | 'assistant.modelMissingDetail'
  | 'assistant.modelInstallButton'
  | 'assistant.modelInstalling'
  | 'assistant.modelInstallOk'
  | 'assistant.modelInstallFailed'
  | 'assistant.error'
  | 'assistant.actionDone'
  | 'assistant.actionFailed'
  | 'assistant.stoppedByLimit'
  | 'assistant.thinking.claudering'
  | 'assistant.thinking.context'
  | 'assistant.thinking.focusWall'
  | 'assistant.thinking.preparing'
  | 'assistant.thinking.processing'
  | 'assistant.status.checking'
  | 'assistant.status.online'
  | 'assistant.status.offline'
  | 'assistant.status.starting'
  | 'assistant.status.ready'
  | 'assistant.status.thinking'
  | 'assistant.status.executing'
  | 'assistant.status.awaitingConfirmation'
  | 'assistant.status.error'
  | 'assistant.confirmYes'
  | 'assistant.confirmNo'
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
    'app.loading': 'Carregando FocusWall...',
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
    'settings.wallbot': 'Wallbot',
    'settings.wallbotModel': 'Modelo do Wallbot',
    'settings.wallbotModelAuto': 'Automático (recomendado)',
    'settings.wallbotModelHelp': 'Deixe no automático para usar o melhor modelo compatível instalado.',
    'settings.wallbotModelLoading': 'Verificando modelos instalados...',
    'settings.wallbotModelOffline': 'O Ollama está offline. Inicie o serviço para alterar esta preferência.',
    'settings.wallbotModelNoModels': 'Nenhum modelo compatível foi encontrado.',
    'settings.wallbotModelRefresh': 'Atualizar modelos',
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
    'tasks.media': 'Música',
    'tasks.assistant': 'Wallbot',
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
    'tasks.radar': 'Radar',
    'tasks.currentContext': 'Contexto atual',
    'music.accountConnected': 'Conta do YouTube conectada.',
    'music.accountDisconnected': 'Conta do YouTube desconectada.',
    'music.authorizationBrowser': 'Conclua a autorização na janela do navegador.',
    'music.backToLibrary': 'Voltar para a biblioteca',
    'music.configurationBody': 'Adicione as credenciais OAuth nas configurações para conectar sua biblioteca.',
    'music.configurationEyebrow': 'CONFIGURAÇÃO',
    'music.configurationTitle': 'Configure o acesso ao YouTube.',
    'music.connectAction': 'Conectar YouTube',
    'music.connectBody': 'Autorize acesso somente de leitura às playlists para usar a biblioteca e o player integrado.',
    'music.connectTitle': 'Conecte sua conta do YouTube.',
    'music.connected': 'Conectado',
    'music.connecting': 'Conectando…',
    'music.connectingPlayer': 'Conectando à IFrame Player API do YouTube…',
    'music.desktopBody': 'A integração com o YouTube depende dos recursos nativos do FocusWall para Windows.',
    'music.desktopEyebrow': 'DESKTOP',
    'music.desktopTitle': 'Mídia disponível no aplicativo desktop.',
    'music.dismissMessage': 'Fechar mensagem',
    'music.emptyPlaylist': 'Playlist vazia',
    'music.emptyPlaylistBody': 'Não há faixas disponíveis nesta playlist.',
    'music.filteredResult': 'RESULTADO FILTRADO',
    'music.libraryEmpty': 'Nenhuma playlist encontrada',
    'music.libraryEmptyBody': 'Crie ou salve uma playlist no YouTube e atualize esta biblioteca.',
    'music.libraryLabel': 'Biblioteca do YouTube',
    'music.libraryRefreshing': 'Atualizando biblioteca',
    'music.libraryRefreshingBody': 'Buscando as playlists mais recentes da sua conta.',
    'music.librarySubtitle': 'Playlists salvas, prontas para tocar sem tirar você do fluxo.',
    'music.libraryTitle': 'Sua biblioteca',
    'music.loadingTracks': 'Carregando faixas',
    'music.loadingTracksBody': 'Sincronizando a fila desta playlist.',
    'music.miniIdleTitle': 'FocusWall Music',
    'music.miniPlayerLabel': 'Player persistente do YouTube',
    'music.mute': 'Silenciar',
    'music.next': 'Próxima',
    'music.nextTrack': 'Próxima faixa',
    'music.noActivePlayback': 'Nenhuma reprodução ativa',
    'music.noTrackSelected': 'Escolha uma faixa',
    'music.noTrackSelectedBody': 'Abra uma playlist e inicie a reprodução para carregar o player.',
    'music.notConnected': 'Não conectado',
    'music.nowPlaying': 'TOCANDO AGORA',
    'music.officialPlayerLabel': 'Player oficial do YouTube',
    'music.openPlaylist': 'Abrir playlist',
    'music.panelLabel': 'Mídia e reprodução',
    'music.pause': 'Pausar',
    'music.play': 'Reproduzir',
    'music.playAll': 'Tocar tudo',
    'music.playTrack': 'Tocar faixa',
    'music.playbackControls': 'Controles de reprodução',
    'music.playbackFailed': 'Falha na reprodução',
    'music.playerApiInitFailed': 'A API do player do YouTube não foi inicializada.',
    'music.playerAutoplayBlocked': 'A reprodução automática foi bloqueada. Use o botão de reproduzir.',
    'music.playerConnecting': 'Conectando',
    'music.playerControlFailed': 'Não foi possível alterar o estado de reprodução.',
    'music.playerEmbedBlocked': 'Esta faixa não permite reprodução incorporada.',
    'music.playerGenericError': 'O player do YouTube retornou um erro inesperado.',
    'music.playerIdentityRejected': 'O YouTube recusou a identidade desta incorporação. Reinicie o player ou verifique a origem configurada.',
    'music.playerInvalidTrack': 'A faixa selecionada não possui um vídeo reproduzível.',
    'music.playerLoadFailed': 'Não foi possível carregar a API do player do YouTube.',
    'music.playerLoadFailedShort': 'Não foi possível recriar o player do YouTube.',
    'music.playerLoadTimeout': 'O player do YouTube demorou demais para carregar.',
    'music.playerLoading': 'Carregando',
    'music.playerLoopFailed': 'Não foi possível alterar a repetição da fila.',
    'music.playerMuteFailed': 'Não foi possível alterar o áudio.',
    'music.playerNextFailed': 'Não foi possível avançar para a próxima faixa.',
    'music.playerPaused': 'Pausado',
    'music.playerPlaying': 'Reproduzindo',
    'music.playerPreviousFailed': 'Não foi possível voltar para a faixa anterior.',
    'music.playerQueueEnd': 'Você chegou ao fim da fila.',
    'music.playerQueueFallback': 'A fila do YouTube foi rejeitada. Tentando reprodução faixa a faixa.',
    'music.playerQueueLoadFailed': 'Não foi possível carregar a fila de reprodução.',
    'music.playerRejectedTrack': 'O YouTube rejeitou esta faixa.',
    'music.playerRestartFailed': 'Não foi possível reiniciar a faixa atual.',
    'music.playerSeekFailed': 'Não foi possível alterar a posição da faixa.',
    'music.playerShuffleFailed': 'Não foi possível alterar o modo aleatório.',
    'music.playerSkippingNext': 'Pulando para a próxima faixa disponível.',
    'music.playerStartFailed': 'Não foi possível iniciar a reprodução.',
    'music.playerTrackLoadFailed': 'Não foi possível carregar esta faixa.',
    'music.playerUnavailableTrack': 'Esta faixa não está mais disponível.',
    'music.playerVolumeFailed': 'Não foi possível alterar o volume.',
    'music.playerWaiting': 'Aguardando',
    'music.playlist': 'playlist',
    'music.playlistEyebrow': 'PLAYLIST',
    'music.playlists': 'playlists',
    'music.preparingPlayer': 'Preparando player',
    'music.previous': 'Anterior',
    'music.previousTrack': 'Faixa anterior',
    'music.progressA11y': '{current} de {duration}',
    'music.queueEyebrow': 'FILA',
    'music.queueLabel': 'Fila de reprodução',
    'music.refreshPlaylists': 'Atualizar playlists',
    'music.refreshTracks': 'Atualizar faixas',
    'music.repeatQueue': 'Repetir fila',
    'music.retry': 'Tentar novamente',
    'music.searchEmpty': 'Nenhum resultado',
    'music.searchEmptyBody': 'Tente outro nome para encontrar uma playlist.',
    'music.searchPlaylists': 'Buscar playlists…',
    'music.searchTracks': 'Buscar nesta playlist…',
    'music.selectTrack': 'Selecione uma faixa',
    'music.selectedPlaylistLabel': 'Playlist selecionada',
    'music.settingsConnect': 'Conectar conta',
    'music.settingsDesktopCredential': 'Use uma credencial OAuth do tipo aplicativo para computador.',
    'music.settingsDisconnect': 'Desconectar conta',
    'music.settingsDisconnecting': 'Desconectando…',
    'music.settingsEyebrow': 'YOUTUBE OAUTH',
    'music.settingsKeepSecret': 'Deixe vazio para manter o segredo atual',
    'music.settingsLoading': 'Carregando configuração do YouTube…',
    'music.settingsOpenApi': 'Abrir YouTube Data API',
    'music.settingsOpenOauth': 'Abrir Google OAuth',
    'music.settingsPasteSecret': 'Cole o OAuth Client Secret',
    'music.settingsSave': 'Salvar credenciais',
    'music.settingsSaved': 'Credenciais do YouTube salvas com proteção local.',
    'music.settingsSaving': 'Salvando…',
    'music.settingsSecretStored': 'Um Client Secret protegido já está armazenado. Deixe o campo vazio para mantê-lo.',
    'music.settingsSecurity': 'O Client Secret e o refresh token são protegidos pelo Windows DPAPI antes de serem persistidos localmente.',
    'music.settingsTitle': 'Integração de mídia',
    'music.shuffle': 'Aleatório',
    'music.syncingBody': 'Validando a sessão e preparando as playlists do YouTube.',
    'music.syncingEyebrow': 'MÍDIA',
    'music.syncingTitle': 'Sincronizando sua biblioteca.',
    'music.toggleLoop': 'Ativar ou desativar repetição',
    'music.toggleShuffle': 'Ativar ou desativar modo aleatório',
    'music.track': 'faixa',
    'music.trackPosition': 'Posição da faixa',
    'music.trackSearchEmpty': 'Nenhuma faixa encontrada',
    'music.trackSearchEmptyBody': 'Ajuste a busca para ver outras faixas.',
    'music.tracks': 'faixas',
    'music.unmute': 'Ativar som',
    'music.videoLabel': 'Vídeo oficial do YouTube',
    'music.volume': 'Volume',
    'music.youtubeBrand': 'YouTube',
    'music.youtubeEyebrow': 'YOUTUBE',
    'radar.panelLabel': 'Radar de contexto atual',
    'radar.refresh': 'Atualizar',
    'radar.refreshing': 'Atualizando...',
    'radar.updatedAt': 'Atualizado {time}',
    'radar.cachedAt': 'Cache de {time}',
    'radar.stale': 'Dados desatualizados',
    'radar.partial': 'Dados parcialmente disponíveis',
    'radar.fixture': 'Modo demonstração: dados fictícios, sem acesso aos provedores.',
    'radar.weather': 'Clima',
    'radar.news': 'Notícias',
    'radar.newsEyebrow': 'Em destaque',
    'radar.newsCount': '{count} matérias disponíveis',
    'radar.location': 'Localização',
    'radar.changeLocation': 'Alterar localização',
    'radar.removeLocation': 'Remover localização',
    'radar.locationRequiredTitle': 'Escolha uma cidade',
    'radar.locationRequiredBody': 'Selecione uma localização para consultar o clima. As notícias continuam disponíveis.',
    'radar.locationSearchLabel': 'Pesquisar cidade',
    'radar.locationSearchPlaceholder': 'Digite ao menos 2 caracteres',
    'radar.locationSearchEmpty': 'Nenhuma localização encontrada.',
    'radar.locationSearchError': 'Não foi possível pesquisar localizações.',
    'radar.temperature': 'Temperatura',
    'radar.feelsLike': 'Sensação',
    'radar.humidity': 'Umidade',
    'radar.precipitation': 'Chuva',
    'radar.wind': 'Vento',
    'radar.minimum': 'Mín.',
    'radar.maximum': 'Máx.',
    'radar.nextHours': 'Próximas horas',
    'radar.hourlyA11y': '{time}: {temperature}, {condition}; chuva {precipitation}',
    'radar.category.all': 'Tudo',
    'radar.category.brasil': 'Brasil',
    'radar.category.technology': 'Tecnologia',
    'radar.category.development': 'Desenvolvimento',
    'radar.category.security': 'Segurança',
    'radar.category.business': 'Economia',
    'radar.category.science': 'Ciência',
    'radar.category.world': 'Mundo',
    'radar.personalization': 'Personalizar Radar',
    'radar.personalizationHelp': 'Separe os itens por vírgula. Eles influenciam o ranking e o ticker.',
    'radar.followedTopics': 'Tópicos acompanhados',
    'radar.blockedTopics': 'Tópicos bloqueados',
    'radar.preferredSources': 'Fontes preferidas',
    'radar.mutedSources': 'Fontes silenciadas',
    'radar.tickerSymbols': 'Indicadores do ticker',
    'radar.preferencePlaceholder': 'ex.: inteligência artificial, economia',
    'radar.savePreferences': 'Salvar preferências',
    'radar.loadMore': 'Carregar mais notícias',
    'radar.relatedCount': '{count} relacionadas',
    'radar.previewLoading': 'Carregando matéria...',
    'radar.previewError': 'Não foi possível carregar esta matéria.',
    'radar.closePreview': 'Fechar',
    'radar.openInBrowser': 'Abrir matéria completa no navegador',
    'radar.openUnavailable': 'Esta matéria não pode ser aberta externamente.',
    'radar.relatedArticles': 'Relacionadas',
    'radar.sevenDays': 'Próximos 7 dias',
    'radar.estimateBadge': 'Estimativa meteorológica',
    'radar.alerts': 'Sinalizações',
    'radar.alert.heavyRain': 'Chuva intensa prevista',
    'radar.alert.storm': 'Alta probabilidade de tempestade',
    'radar.alert.strongWind': 'Vento forte',
    'radar.alert.highHeat': 'Calor elevado',
    'radar.alert.intenseCold': 'Frio intenso',
    'radar.alert.lowHumidity': 'Umidade baixa',
    'radar.alert.veryHighUv': 'UV muito alto',
    'radar.newsEmpty': 'Nenhuma notícia disponível nesta categoria.',
    'radar.newsUnavailable': 'As notícias estão indisponíveis no momento.',
    'radar.imagesUnavailable': 'Algumas imagens não puderam ser carregadas; a notícia continua disponível.',
    'radar.weatherUnavailable': 'O clima está indisponível no momento.',
    'radar.usingCachedData': 'Exibindo dados em cache.',
    'radar.openArticle': 'Abrir prévia da notícia',
    'radar.openArticleError': 'Não foi possível abrir o conteúdo externo.',
    'radar.source': 'Fonte',
    'radar.attributionWeather': 'Dados meteorológicos por Open-Meteo',
    'radar.attributionNews': 'Notícias de Agência Brasil, InfoQ Brasil, BrazilJS, CERT.br, TabNews, Tecnoblog e GitHub Blog',
    'radar.relative.now': 'agora',
    'radar.relative.minutes': 'há {count} min',
    'radar.relative.hours': 'há {count} h',
    'radar.relative.days': 'há {count} d',
    'radar.condition.clear': 'Céu limpo',
    'radar.condition.mainlyClear': 'Predominantemente limpo',
    'radar.condition.partlyCloudy': 'Parcialmente nublado',
    'radar.condition.overcast': 'Nublado',
    'radar.condition.fog': 'Neblina',
    'radar.condition.drizzle': 'Garoa',
    'radar.condition.rain': 'Chuva',
    'radar.condition.snow': 'Neve',
    'radar.condition.showers': 'Pancadas de chuva',
    'radar.condition.thunderstorm': 'Trovoadas',
    'radar.condition.unknown': 'Condição desconhecida',
    'radar.loadFailed': 'Não foi possível carregar o cache do Radar.',
    'radar.refreshFailed': 'Não foi possível atualizar o Radar.',
    'radar.openFailed': 'Não foi possível abrir a notícia.',
    'radar.statusReady': 'Dados atualizados',
    'radar.statusLoading': 'Carregando dados do Radar...',
    'radar.statusError': 'Dados indisponíveis',
    'radar.locationResults': 'Resultados de localização',
    'radar.closeLocation': 'Fechar seleção de localização',
    'radar.retry': 'Tentar novamente',
    'radar.noPublishedDate': 'Data não informada',
    'radar.preferencesSaveFailed': 'Não foi possível salvar as preferências do Radar.',
    'radar.refreshFailedUsingCache': 'A atualização falhou. Os dados anteriores continuam visíveis.',
    'radar.refreshCooldown': 'A atualização manual estará disponível novamente em instantes.',
    'radar.refreshCooldownUntil': 'Atualização manual disponível novamente às {time}.',
    'radar.locationSaveError': 'Não foi possível salvar a localização.',
    'radar.locationResultsCount': '{count} localizações encontradas.',
    'radar.enabledCategories': 'Categorias ativas',
    'radar.categorySaveError': 'Não foi possível salvar as categorias.',
    'radar.partialSourceWarning': 'Uma ou mais fontes de notícias estão temporariamente indisponíveis.',
    'radar.cacheWriteFailed': 'Os dados foram atualizados, mas não puderam ser gravados no cache local.',
    'radar.cacheReadFailed': 'O cache local não pôde ser lido. Os dados disponíveis podem não incluir o conteúdo anterior.',
    'radar.refreshFailedNoData': 'Não foi possível carregar dados do Radar.',
    'radar.gusts': 'Rajada',
    'radar.pressure': 'Pressão',
    'radar.uvIndex': 'UV máx.',
    'radar.sunrise': 'Nascer',
    'radar.sunset': 'Pôr',
    'radar.ticker': 'Câmbio, cripto e eventos',
    'radar.quote.ptax': 'PTAX',
    'radar.quote.spot': 'À VISTA',
    'radar.quote.estimate': 'ESTIMATIVA',
    'radar.quote.event': 'EVENTO',
    'system.loading': 'Coletando um novo retrato do sistema...',
    'system.desktopOnly': 'As métricas do sistema estão disponíveis apenas no aplicativo desktop.',
    'system.paused': 'Coleta pausada',
    'system.pausedTitle': 'O sistema está em espera.',
    'system.pausedBody': 'Retome o FocusWall para iniciar uma leitura pontual e atualizada deste computador.',
    'system.collectionFailed': 'Falha na coleta',
    'system.errorTitle': 'Não foi possível ler o sistema.',
    'system.loadFailed': 'A coleta de métricas não pôde ser concluída.',
    'system.retry': 'Tentar novamente',
    'system.snapshotReady': 'Snapshot concluído',
    'system.partialSnapshot': 'Snapshot parcial',
    'system.partialDetails': 'Detalhes de disponibilidade',
    'system.capturedAt': 'Capturado às',
    'system.overview': 'Visão geral do sistema',
    'system.cpu': 'CPU',
    'system.memory': 'Memória',
    'system.disk': 'Disco',
    'system.network': 'Rede',
    'system.gpu': 'GPU',
    'system.unavailable': 'Não disponível',
    'system.noData': 'Sem dados',
    'system.logicalProcessors': 'processadores lógicos',
    'system.hardware': 'Hardware',
    'system.processor': 'Processador',
    'system.frequency': 'Frequência',
    'system.physicalCores': 'Núcleos físicos',
    'system.availableMemory': 'Memória disponível',
    'system.storage': 'Armazenamento',
    'system.disks': 'Volumes',
    'system.read': 'Leitura',
    'system.write': 'Gravação',
    'system.noDiskData': 'Nenhum volume pôde ser lido.',
    'system.connectivity': 'Conectividade',
    'system.download': 'Download',
    'system.upload': 'Upload',
    'system.noNetworkData': 'Nenhuma interface de rede ativa foi detectada.',
    'system.graphics': 'Gráficos',
    'system.usage': 'Uso',
    'system.dedicatedMemory': 'Memória dedicada',
    'system.noGpuData': 'A GPU não expõe métricas compatíveis.',
    'system.machine': 'Máquina',
    'system.operatingSystem': 'Sistema operacional',
    'system.uptime': 'Tempo em atividade',
    'system.totalMemory': 'Memória total',
    'system.sensors': 'Sensores',
    'system.temperatures': 'Temperaturas',
    'system.activity': 'Atividade atual',
    'system.processes': 'Processos',
    'system.processCount': '{count} processos',
    'system.processCountLimited': '{shown} de {total} processos mais ativos',
    'system.processSearchScope': 'A busca considera os processos carregados neste retrato.',
    'system.searchProcesses': 'Pesquisar processos',
    'system.searchPlaceholder': 'Buscar por nome, executável ou PID',
    'system.noProcesses': 'Nenhum processo corresponde à busca.',
    'system.process': 'Processo',
    'system.type': 'Tipo',
    'system.application': 'Aplicativo',
    'system.systemProcess': 'Sistema',
    'tasks.nowPlaying': 'YouTube • biblioteca',
    'tasks.operator': 'Operador local',
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
    'rates.title': 'Câmbio BRL',
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
    'assistant.panelLabel': 'Wallbot',
    'assistant.you': 'Você',
    'assistant.name': 'Wallbot',
    'assistant.refresh': 'Atualizar',
    'assistant.clearChat': 'Limpar conversa',
    'assistant.emptyTitle': 'Olá, eu sou o Wallbot.',
    'assistant.emptyBody': 'Envie uma solicitação para organizar tarefas, calendário ou seu próximo foco.',
    'assistant.inputLabel': 'Mensagem para o Wallbot',
    'assistant.placeholder': 'Peça ao Wallbot para organizar seu próximo movimento...',
    'assistant.composerHint': 'Enter envia · Shift + Enter quebra linha',
    'assistant.send': 'Enviar',
    'assistant.sending': 'Enviando...',
    'assistant.cancel': 'Cancelar',
    'assistant.cancelled': 'Resposta cancelada.',
    'assistant.offline': 'Wallbot indisponível. Abra o app Ollama ou execute "ollama serve" e clique em Atualizar.',
    'assistant.startEyebrow': 'Serviço local',
    'assistant.startTitle': 'O Wallbot precisa ser iniciado',
    'assistant.startBody': 'O FocusWall não conseguiu acessar o serviço local do Wallbot. Inicie o serviço para usar comandos por linguagem natural.',
    'assistant.startButton': 'Iniciar Wallbot',
    'assistant.starting': 'Iniciando...',
    'assistant.startOk': 'Wallbot iniciado.',
    'assistant.modelMissingEyebrow': 'Modelo local',
    'assistant.modelMissingTitle': 'O modelo do Wallbot não está disponível',
    'assistant.modelMissingBody': 'O Ollama está online, mas nenhum modelo compatível foi encontrado. Instale o modelo padrão para ativar o Wallbot.',
    'assistant.modelMissingDetail': 'O modelo padrão configurado está indisponível.',
    'assistant.modelInstallButton': 'Instalar modelo',
    'assistant.modelInstalling': 'Instalando modelo...',
    'assistant.modelInstallOk': 'Modelo do Wallbot instalado.',
    'assistant.modelInstallFailed': 'Não foi possível instalar o modelo do Wallbot.',
    'assistant.error': 'Não foi possível concluir a resposta.',
    'assistant.actionDone': 'ação concluída',
    'assistant.actionFailed': 'ação falhou',
    'assistant.stoppedByLimit': 'interrompido pelo limite de ações',
    'assistant.thinking.claudering': 'claudering...',
    'assistant.thinking.context': 'organizando contexto...',
    'assistant.thinking.focusWall': 'consultando o FocusWall...',
    'assistant.thinking.preparing': 'preparando resposta...',
    'assistant.thinking.processing': 'pensando...',
    'assistant.status.checking': 'Verificando',
    'assistant.status.online': 'Online',
    'assistant.status.offline': 'Offline',
    'assistant.status.starting': 'Iniciando',
    'assistant.status.ready': 'Pronto',
    'assistant.status.thinking': 'Pensando',
    'assistant.status.executing': 'Executando ação',
    'assistant.status.awaitingConfirmation': 'Aguardando confirmação',
    'assistant.status.error': 'Erro',
    'assistant.confirmYes': 'Sim, confirmar',
    'assistant.confirmNo': 'Cancelar',
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
    'app.loading': 'Loading FocusWall...',
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
    'settings.wallbot': 'Wallbot',
    'settings.wallbotModel': 'Wallbot model',
    'settings.wallbotModelAuto': 'Automatic (recommended)',
    'settings.wallbotModelHelp': 'Keep automatic to use the best compatible installed model.',
    'settings.wallbotModelLoading': 'Checking installed models...',
    'settings.wallbotModelOffline': 'Ollama is offline. Start the service to change this preference.',
    'settings.wallbotModelNoModels': 'No compatible model was found.',
    'settings.wallbotModelRefresh': 'Refresh models',
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
    'tasks.media': 'Music',
    'tasks.assistant': 'Wallbot',
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
    'tasks.radar': 'Radar',
    'tasks.currentContext': 'Current context',
    'music.accountConnected': 'YouTube account connected.',
    'music.accountDisconnected': 'YouTube account disconnected.',
    'music.authorizationBrowser': 'Complete authorization in the browser window.',
    'music.backToLibrary': 'Back to library',
    'music.configurationBody': 'Add the OAuth credentials in settings to connect your library.',
    'music.configurationEyebrow': 'SETUP',
    'music.configurationTitle': 'Configure YouTube access.',
    'music.connectAction': 'Connect YouTube',
    'music.connectBody': 'Authorize read-only playlist access to use the integrated library and player.',
    'music.connectTitle': 'Connect your YouTube account.',
    'music.connected': 'Connected',
    'music.connecting': 'Connecting…',
    'music.connectingPlayer': 'Connecting to the YouTube IFrame Player API…',
    'music.desktopBody': 'YouTube integration depends on native FocusWall for Windows capabilities.',
    'music.desktopEyebrow': 'DESKTOP',
    'music.desktopTitle': 'Media is available in the desktop app.',
    'music.dismissMessage': 'Dismiss message',
    'music.emptyPlaylist': 'Empty playlist',
    'music.emptyPlaylistBody': 'There are no tracks available in this playlist.',
    'music.filteredResult': 'FILTERED RESULT',
    'music.libraryEmpty': 'No playlists found',
    'music.libraryEmptyBody': 'Create or save a playlist on YouTube, then refresh this library.',
    'music.libraryLabel': 'YouTube library',
    'music.libraryRefreshing': 'Refreshing library',
    'music.libraryRefreshingBody': 'Fetching the latest playlists from your account.',
    'music.librarySubtitle': 'Saved playlists, ready to play without taking you out of your flow.',
    'music.libraryTitle': 'Your library',
    'music.loadingTracks': 'Loading tracks',
    'music.loadingTracksBody': 'Syncing this playlist queue.',
    'music.miniIdleTitle': 'FocusWall Music',
    'music.miniPlayerLabel': 'Persistent YouTube player',
    'music.mute': 'Mute',
    'music.next': 'Next',
    'music.nextTrack': 'Next track',
    'music.noActivePlayback': 'No active playback',
    'music.noTrackSelected': 'Choose a track',
    'music.noTrackSelectedBody': 'Open a playlist and start playback to load the player.',
    'music.notConnected': 'Not connected',
    'music.nowPlaying': 'NOW PLAYING',
    'music.officialPlayerLabel': 'Official YouTube player',
    'music.openPlaylist': 'Open playlist',
    'music.panelLabel': 'Media and playback',
    'music.pause': 'Pause',
    'music.play': 'Play',
    'music.playAll': 'Play all',
    'music.playTrack': 'Play track',
    'music.playbackControls': 'Playback controls',
    'music.playbackFailed': 'Playback failed',
    'music.playerApiInitFailed': 'The YouTube player API did not initialize.',
    'music.playerAutoplayBlocked': 'Autoplay was blocked. Use the play button.',
    'music.playerConnecting': 'Connecting',
    'music.playerControlFailed': 'Could not change playback state.',
    'music.playerEmbedBlocked': 'This track does not allow embedded playback.',
    'music.playerGenericError': 'The YouTube player returned an unexpected error.',
    'music.playerIdentityRejected': 'YouTube rejected this embed identity. Restart the player or verify the configured origin.',
    'music.playerInvalidTrack': 'The selected track does not have a playable video.',
    'music.playerLoadFailed': 'Could not load the YouTube player API.',
    'music.playerLoadFailedShort': 'Could not recreate the YouTube player.',
    'music.playerLoadTimeout': 'The YouTube player took too long to load.',
    'music.playerLoading': 'Loading',
    'music.playerLoopFailed': 'Could not change queue repeat.',
    'music.playerMuteFailed': 'Could not change audio state.',
    'music.playerNextFailed': 'Could not go to the next track.',
    'music.playerPaused': 'Paused',
    'music.playerPlaying': 'Playing',
    'music.playerPreviousFailed': 'Could not go to the previous track.',
    'music.playerQueueEnd': 'You reached the end of the queue.',
    'music.playerQueueFallback': 'The YouTube queue was rejected. Trying track-by-track playback.',
    'music.playerQueueLoadFailed': 'Could not load the playback queue.',
    'music.playerRejectedTrack': 'YouTube rejected this track.',
    'music.playerRestartFailed': 'Could not restart the current track.',
    'music.playerSeekFailed': 'Could not change the track position.',
    'music.playerShuffleFailed': 'Could not change shuffle mode.',
    'music.playerSkippingNext': 'Skipping to the next available track.',
    'music.playerStartFailed': 'Could not start playback.',
    'music.playerTrackLoadFailed': 'Could not load this track.',
    'music.playerUnavailableTrack': 'This track is no longer available.',
    'music.playerVolumeFailed': 'Could not change the volume.',
    'music.playerWaiting': 'Waiting',
    'music.playlist': 'playlist',
    'music.playlistEyebrow': 'PLAYLIST',
    'music.playlists': 'playlists',
    'music.preparingPlayer': 'Preparing player',
    'music.previous': 'Previous',
    'music.previousTrack': 'Previous track',
    'music.progressA11y': '{current} of {duration}',
    'music.queueEyebrow': 'QUEUE',
    'music.queueLabel': 'Playback queue',
    'music.refreshPlaylists': 'Refresh playlists',
    'music.refreshTracks': 'Refresh tracks',
    'music.repeatQueue': 'Repeat queue',
    'music.retry': 'Try again',
    'music.searchEmpty': 'No results',
    'music.searchEmptyBody': 'Try another name to find a playlist.',
    'music.searchPlaylists': 'Search playlists…',
    'music.searchTracks': 'Search this playlist…',
    'music.selectTrack': 'Select a track',
    'music.selectedPlaylistLabel': 'Selected playlist',
    'music.settingsConnect': 'Connect account',
    'music.settingsDesktopCredential': 'Use an OAuth credential configured as a desktop application.',
    'music.settingsDisconnect': 'Disconnect account',
    'music.settingsDisconnecting': 'Disconnecting…',
    'music.settingsEyebrow': 'YOUTUBE OAUTH',
    'music.settingsKeepSecret': 'Leave blank to keep the current secret',
    'music.settingsLoading': 'Loading YouTube settings…',
    'music.settingsOpenApi': 'Open YouTube Data API',
    'music.settingsOpenOauth': 'Open Google OAuth',
    'music.settingsPasteSecret': 'Paste the OAuth Client Secret',
    'music.settingsSave': 'Save credentials',
    'music.settingsSaved': 'YouTube credentials saved with local protection.',
    'music.settingsSaving': 'Saving…',
    'music.settingsSecretStored': 'A protected Client Secret is already stored. Leave the field blank to keep it.',
    'music.settingsSecurity': 'The Client Secret and refresh token are protected with Windows DPAPI before being persisted locally.',
    'music.settingsTitle': 'Media integration',
    'music.shuffle': 'Shuffle',
    'music.syncingBody': 'Validating the session and preparing your YouTube playlists.',
    'music.syncingEyebrow': 'MEDIA',
    'music.syncingTitle': 'Syncing your library.',
    'music.toggleLoop': 'Toggle queue repeat',
    'music.toggleShuffle': 'Toggle shuffle mode',
    'music.track': 'track',
    'music.trackPosition': 'Track position',
    'music.trackSearchEmpty': 'No tracks found',
    'music.trackSearchEmptyBody': 'Adjust your search to see other tracks.',
    'music.tracks': 'tracks',
    'music.unmute': 'Unmute',
    'music.videoLabel': 'Official YouTube video',
    'music.volume': 'Volume',
    'music.youtubeBrand': 'YouTube',
    'music.youtubeEyebrow': 'YOUTUBE',
    'radar.panelLabel': 'Current context radar',
    'radar.refresh': 'Refresh',
    'radar.refreshing': 'Refreshing...',
    'radar.updatedAt': 'Updated {time}',
    'radar.cachedAt': 'Cached {time}',
    'radar.stale': 'Outdated data',
    'radar.partial': 'Partially available data',
    'radar.fixture': 'Demo mode: fictional data, no provider access.',
    'radar.weather': 'Weather',
    'radar.news': 'News',
    'radar.newsEyebrow': 'In focus',
    'radar.newsCount': '{count} articles available',
    'radar.location': 'Location',
    'radar.changeLocation': 'Change location',
    'radar.removeLocation': 'Remove location',
    'radar.locationRequiredTitle': 'Choose a city',
    'radar.locationRequiredBody': 'Select a location to load weather. News remains available.',
    'radar.locationSearchLabel': 'Search city',
    'radar.locationSearchPlaceholder': 'Enter at least 2 characters',
    'radar.locationSearchEmpty': 'No locations found.',
    'radar.locationSearchError': 'Locations could not be searched.',
    'radar.temperature': 'Temperature',
    'radar.feelsLike': 'Feels like',
    'radar.humidity': 'Humidity',
    'radar.precipitation': 'Rain',
    'radar.wind': 'Wind',
    'radar.minimum': 'Min.',
    'radar.maximum': 'Max.',
    'radar.nextHours': 'Next hours',
    'radar.hourlyA11y': '{time}: {temperature}, {condition}; precipitation {precipitation}',
    'radar.category.all': 'All',
    'radar.category.brasil': 'Brazil',
    'radar.category.technology': 'Technology',
    'radar.category.development': 'Development',
    'radar.category.security': 'Security',
    'radar.category.business': 'Business',
    'radar.category.science': 'Science',
    'radar.category.world': 'World',
    'radar.personalization': 'Personalize Radar',
    'radar.personalizationHelp': 'Separate items with commas. They influence ranking and the ticker.',
    'radar.followedTopics': 'Followed topics',
    'radar.blockedTopics': 'Blocked topics',
    'radar.preferredSources': 'Preferred sources',
    'radar.mutedSources': 'Muted sources',
    'radar.tickerSymbols': 'Ticker indicators',
    'radar.preferencePlaceholder': 'e.g. artificial intelligence, economy',
    'radar.savePreferences': 'Save preferences',
    'radar.loadMore': 'Load more news',
    'radar.relatedCount': '{count} related',
    'radar.previewLoading': 'Loading article...',
    'radar.previewError': 'This article could not be loaded.',
    'radar.closePreview': 'Close',
    'radar.openInBrowser': 'Open full article in browser',
    'radar.openUnavailable': 'This article cannot be opened externally.',
    'radar.relatedArticles': 'Related',
    'radar.sevenDays': 'Next 7 days',
    'radar.estimateBadge': 'Weather estimate',
    'radar.alerts': 'Signals',
    'radar.alert.heavyRain': 'Heavy rain expected',
    'radar.alert.storm': 'High storm probability',
    'radar.alert.strongWind': 'Strong wind',
    'radar.alert.highHeat': 'High heat',
    'radar.alert.intenseCold': 'Intense cold',
    'radar.alert.lowHumidity': 'Low humidity',
    'radar.alert.veryHighUv': 'Very high UV',
    'radar.newsEmpty': 'No news is available for this category.',
    'radar.newsUnavailable': 'News is currently unavailable.',
    'radar.imagesUnavailable': 'Some images could not be loaded; the article is still available.',
    'radar.weatherUnavailable': 'Weather is currently unavailable.',
    'radar.usingCachedData': 'Showing cached data.',
    'radar.openArticle': 'Open article preview',
    'radar.openArticleError': 'The external content could not be opened.',
    'radar.source': 'Source',
    'radar.attributionWeather': 'Weather data by Open-Meteo',
    'radar.attributionNews': 'News from Agência Brasil, InfoQ Brasil, BrazilJS, CERT.br, TabNews, Tecnoblog and GitHub Blog',
    'radar.relative.now': 'now',
    'radar.relative.minutes': '{count} min ago',
    'radar.relative.hours': '{count} h ago',
    'radar.relative.days': '{count} d ago',
    'radar.condition.clear': 'Clear sky',
    'radar.condition.mainlyClear': 'Mainly clear',
    'radar.condition.partlyCloudy': 'Partly cloudy',
    'radar.condition.overcast': 'Overcast',
    'radar.condition.fog': 'Fog',
    'radar.condition.drizzle': 'Drizzle',
    'radar.condition.rain': 'Rain',
    'radar.condition.snow': 'Snow',
    'radar.condition.showers': 'Rain showers',
    'radar.condition.thunderstorm': 'Thunderstorm',
    'radar.condition.unknown': 'Unknown condition',
    'radar.loadFailed': 'Radar cache could not be loaded.',
    'radar.refreshFailed': 'Radar could not be refreshed.',
    'radar.openFailed': 'The article could not be opened.',
    'radar.statusReady': 'Data is up to date',
    'radar.statusLoading': 'Loading Radar data...',
    'radar.statusError': 'Data unavailable',
    'radar.locationResults': 'Location results',
    'radar.closeLocation': 'Close location picker',
    'radar.retry': 'Try again',
    'radar.noPublishedDate': 'Date unavailable',
    'radar.preferencesSaveFailed': 'Radar preferences could not be saved.',
    'radar.refreshFailedUsingCache': 'The refresh failed. Previous data remains visible.',
    'radar.refreshCooldown': 'Manual refresh will be available again shortly.',
    'radar.refreshCooldownUntil': 'Manual refresh available again at {time}.',
    'radar.locationSaveError': 'The location could not be saved.',
    'radar.locationResultsCount': '{count} locations found.',
    'radar.enabledCategories': 'Active categories',
    'radar.categorySaveError': 'Categories could not be saved.',
    'radar.partialSourceWarning': 'One or more news sources are temporarily unavailable.',
    'radar.cacheWriteFailed': 'Data was refreshed but could not be written to the local cache.',
    'radar.cacheReadFailed': 'The local cache could not be read. Available data may not include previous content.',
    'radar.refreshFailedNoData': 'Radar data could not be loaded.',
    'radar.gusts': 'Gusts',
    'radar.pressure': 'Pressure',
    'radar.uvIndex': 'Max UV',
    'radar.sunrise': 'Sunrise',
    'radar.sunset': 'Sunset',
    'radar.ticker': 'Currencies, crypto and events',
    'radar.quote.ptax': 'PTAX',
    'radar.quote.spot': 'SPOT',
    'radar.quote.estimate': 'ESTIMATE',
    'radar.quote.event': 'EVENT',
    'system.loading': 'Collecting a new system snapshot...',
    'system.desktopOnly': 'System metrics are available only in the desktop application.',
    'system.paused': 'Collection paused',
    'system.pausedTitle': 'System collection is standing by.',
    'system.pausedBody': 'Resume FocusWall to start a fresh, one-time reading of this computer.',
    'system.collectionFailed': 'Collection failed',
    'system.errorTitle': 'The system could not be read.',
    'system.loadFailed': 'The metrics collection could not be completed.',
    'system.retry': 'Try again',
    'system.snapshotReady': 'Snapshot completed',
    'system.partialSnapshot': 'Partial snapshot',
    'system.partialDetails': 'Availability details',
    'system.capturedAt': 'Captured at',
    'system.overview': 'System overview',
    'system.cpu': 'CPU',
    'system.memory': 'Memory',
    'system.disk': 'Disk',
    'system.network': 'Network',
    'system.gpu': 'GPU',
    'system.unavailable': 'Unavailable',
    'system.noData': 'No data',
    'system.logicalProcessors': 'logical processors',
    'system.hardware': 'Hardware',
    'system.processor': 'Processor',
    'system.frequency': 'Frequency',
    'system.physicalCores': 'Physical cores',
    'system.availableMemory': 'Available memory',
    'system.storage': 'Storage',
    'system.disks': 'Volumes',
    'system.read': 'Read',
    'system.write': 'Write',
    'system.noDiskData': 'No volumes could be read.',
    'system.connectivity': 'Connectivity',
    'system.download': 'Download',
    'system.upload': 'Upload',
    'system.noNetworkData': 'No active network interface was detected.',
    'system.graphics': 'Graphics',
    'system.usage': 'Usage',
    'system.dedicatedMemory': 'Dedicated memory',
    'system.noGpuData': 'The GPU does not expose compatible metrics.',
    'system.machine': 'Machine',
    'system.operatingSystem': 'Operating system',
    'system.uptime': 'Uptime',
    'system.totalMemory': 'Total memory',
    'system.sensors': 'Sensors',
    'system.temperatures': 'Temperatures',
    'system.activity': 'Current activity',
    'system.processes': 'Processes',
    'system.processCount': '{count} processes',
    'system.processCountLimited': '{shown} of {total} most active processes',
    'system.processSearchScope': 'Search considers the processes loaded in this snapshot.',
    'system.searchProcesses': 'Search processes',
    'system.searchPlaceholder': 'Search by name, executable, or PID',
    'system.noProcesses': 'No process matches the search.',
    'system.process': 'Process',
    'system.type': 'Type',
    'system.application': 'Application',
    'system.systemProcess': 'System',
    'tasks.nowPlaying': 'YouTube • library',
    'tasks.operator': 'Local operator',
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
    'rates.title': 'BRL exchange',
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
    'assistant.panelLabel': 'Wallbot',
    'assistant.you': 'You',
    'assistant.name': 'Wallbot',
    'assistant.refresh': 'Refresh',
    'assistant.clearChat': 'Clear chat',
    'assistant.emptyTitle': 'Hello, I am Wallbot.',
    'assistant.emptyBody': 'Send a request to organize tasks, your calendar, or your next focus.',
    'assistant.inputLabel': 'Message for Wallbot',
    'assistant.placeholder': 'Ask Wallbot to organize your next move...',
    'assistant.composerHint': 'Enter sends · Shift + Enter adds a line break',
    'assistant.send': 'Send',
    'assistant.sending': 'Sending...',
    'assistant.cancel': 'Cancel',
    'assistant.cancelled': 'Response cancelled.',
    'assistant.offline': 'Wallbot is unavailable. Open the Ollama app or run "ollama serve", then click Refresh.',
    'assistant.startEyebrow': 'Local service',
    'assistant.startTitle': 'Wallbot needs to be started',
    'assistant.startBody': 'FocusWall could not reach the local Wallbot service. Start it to use natural-language commands.',
    'assistant.startButton': 'Start Wallbot',
    'assistant.starting': 'Starting...',
    'assistant.startOk': 'Wallbot started.',
    'assistant.modelMissingEyebrow': 'Local model',
    'assistant.modelMissingTitle': 'Wallbot model is unavailable',
    'assistant.modelMissingBody': 'Ollama is online, but no compatible model was found. Install the default model to enable Wallbot.',
    'assistant.modelMissingDetail': 'The configured default model is unavailable.',
    'assistant.modelInstallButton': 'Install model',
    'assistant.modelInstalling': 'Installing model...',
    'assistant.modelInstallOk': 'Wallbot model installed.',
    'assistant.modelInstallFailed': 'Could not install the Wallbot model.',
    'assistant.error': 'Could not complete the response.',
    'assistant.actionDone': 'action completed',
    'assistant.actionFailed': 'action failed',
    'assistant.stoppedByLimit': 'stopped by the action limit',
    'assistant.thinking.claudering': 'claudering...',
    'assistant.thinking.context': 'organizing context...',
    'assistant.thinking.focusWall': 'checking FocusWall...',
    'assistant.thinking.preparing': 'preparing response...',
    'assistant.thinking.processing': 'thinking...',
    'assistant.status.checking': 'Checking',
    'assistant.status.online': 'Online',
    'assistant.status.offline': 'Offline',
    'assistant.status.starting': 'Starting',
    'assistant.status.ready': 'Ready',
    'assistant.status.thinking': 'Thinking',
    'assistant.status.executing': 'Running action',
    'assistant.status.awaitingConfirmation': 'Awaiting confirmation',
    'assistant.status.error': 'Error',
    'assistant.confirmYes': 'Yes, confirm',
    'assistant.confirmNo': 'Cancel',
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
