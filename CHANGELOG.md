# Changelog

### Assistente — autonomia e confiabilidade
- Camada determinística ampliada: navegação de datas ("vai para o dia 11 de julho", "volta pra hoje", "semana que vem", "mês que vem"), listagem de eventos e tarefas, e compromissos sem verbo ("consulta médica amanhã 9h30").
- Datas e horários mais tolerantes: "11 de julho" sem "dia", "julho 11", "14h"/"9h30"/"às 9" sem depender de acentos.
- Aniversários de terceiros com "niver do João"; recorrência anual inferida automaticamente.
- Referências a tarefas resolvidas sem o modelo: "marca a última tarefa como concluída", "apaga a última tarefa", "reabre a tarefa X", "fixa aquela tarefa"; quando a referência é ambígua, o assistente pergunta objetivamente em vez de adivinhar.
- Contrato forte das tools: todas retornam `ok`, `changed`, `matchedCount`, `changedCount`, `reason` e `affectedItems`; logs de ação agora carregam o `itemId` afetado para resolver "isso" em turnos seguintes.
- Corrigido o bloqueio de falso "pronto" que também bloqueava respostas legítimas após ações reais executadas no mesmo turno; padrões de detecção ampliados ("criei", "removi", "agendei"...).
- Corrigido strip de "às HH" nos títulos (o `\b` de regex não funciona antes de caracteres acentuados).
- Confirmação/cancelamento com vocabulário ampliado ("pode", "manda", "esquece", "deixa pra lá") e novo status visível "Aguardando confirmação"; confirmações antigas já resolvidas nunca reexecutam.
- Suíte de regressão do assistente ampliada (33 novos testes): variações naturais, segurança de confirmação, duplicidade e falso "pronto".

### Revisão Neural — terceira passada
- Corrigida a renomeação de notas para também reescrever wikilinks dentro da própria nota renomeada, evitando que self-links virem links pendentes.
- Melhorada a inserção de links pelo editor: seleção de texto diferente do alvo agora vira alias Obsidian-style (`[[Alvo|texto selecionado]]`).
- Ajustado o posicionamento do cursor após inserir links com alias.
- Adicionados testes de store para renomeação com self-links e testes de inserção de wikilinks com alias.

### Revisão Neural — segunda passada
- Corrigido o schema nativo Tauri/Rust para persistir `neuralNotes` no app desktop (`STATE_VERSION = 6`).
- Corrigido `stripWikiLinks()` para respeitar alias como texto visível, mantendo busca por alvo oculto.
- Corrigida a conversão de menções para não alterar texto dentro de wikilinks ou aliases existentes.
- Menções soltas agora aparecem mesmo quando a mesma nota também contém um link explícito para o alvo.
- Adicionados testes de persistência do estado neural e casos de wikilink/alias/menção mista.


All notable changes to Focus Dashboard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Música — YouTube integrado

- Nova tela de recuperação para autorização YouTube expirada/revogada (`invalid_grant`), substituindo o toast com erro OAuth bruto por reconexão orientada e acesso direto às configurações.
- Refresh token rejeitado, access token em memória e caches de Música são invalidados de forma consistente; respostas assíncronas antigas não podem restaurar a biblioteca da sessão inválida.
- Erros de refresh OAuth deixam de expor o corpo bruto retornado pelo Google na interface; `invalid_grant` é propagado internamente por um código estável e tipado no frontend.
- Aba **Mídia** substituída visualmente por **Música**, preservando o identificador interno `media` para compatibilidade de navegação.
- Biblioteca de playlists próprias via YouTube Data API v3 (`playlists.list(mine=true)` + paginação).
- Lista de faixas via `playlistItems.list` e reprodução no YouTube IFrame Player API.
- Controles FocusWall: play/pause, anterior/próxima, seek, volume, shuffle e loop.
- OAuth 2.0 para desktop com navegador do sistema, redirect loopback, PKCE S256 e `state`.
- Refresh token protegido com Windows DPAPI; access token permanece somente em memória.
- CSP restrita aos hosts necessários do YouTube/thumbnails.
- Identificação do player no WebView2 via `Referer` restrito aos hosts do YouTube, com tratamento explícito do erro 153.
- Reprodução é pausada ao sair da aba Música para evitar player invisível em background.
- Documentação: `docs/PLAN-YOUTUBE-MUSIC.md`, `docs/YOUTUBE-MUSIC-SETUP.md` e `docs/YOUTUBE-MUSIC-AUTH-RECOVERY.md`.

### Radar — revisão de segurança, concorrência e confiabilidade

- Normalização estrita impede que `null`, strings vazias e booleanos sejam convertidos em valores meteorológicos ou coordenadas zero.
- Preview web não presume localização; clima exige seleção explícita e notícias fictícias respeitam categorias habilitadas.
- Persistência de `dashboard-state.json` centralizada em fila global, evitando perda concorrente de tarefas, calendário, notas, tema e preferências Radar.
- URLs privadas e locais reforçadas, incluindo subdomínios `.localhost` e IPv4 mapeado em IPv6.
- Cache Radar versionado e validado semanticamente, com pruning, quarantine limitada, recuperação crash-safe e warnings de leitura/escrita.
- HTTP usa deadline total de 8 segundos; parser RSS/Atom streaming possui limites de bytes, profundidade, eventos e entradas e rejeita DTD.
- Refresh expõe erro e cooldown, timestamps visuais usam `fetchedAt` real e categorias habilitadas são persistidas separadamente da seleção ativa.
- Modal de localização recebeu focus trap, restauração de foco, `inert`, anúncios acessíveis e descarte de respostas antigas.
- Executável Windows antigo removido; o pacote contém somente fonte coerente com a revisão.

### Fixed

- Revisão de eventos recorrentes: ocorrências deixam de aparecer antes da data original do evento.
- Edição de eventos recorrentes preserva a data base salva e expõe a data da ocorrência apenas como dado derivado.
- Validação de data/horário reforçada no formulário do calendário e nas tools do Assistente.
- Schema local atualizado para `STATE_VERSION = 7` após inclusão de recorrência em eventos.
- Assistente agora expõe `baseDateKey` e `occurrenceDateKey` em eventos recorrentes para evitar deslocar séries por engano.
- Tools do Assistente agora rejeitam `recurrence`, `color`, datas e updates vazios inválidos em vez de normalizar silenciosamente.
- Formulário do calendário exibe aviso claro ao editar uma ocorrência derivada de uma série recorrente.
- Histórico recente do Assistente agora inclui logs de ações executadas, preservando referências imediatas como "o evento que você acabou de criar".
- Atalho determinístico de criação de tarefa não executa pedidos com referências ambíguas como "isso" ou "aquele evento"; nesses casos o modelo usa contexto ou pergunta antes de agir.

### Added

- Assistente agora envia contexto compacto de conversas longas ao Ollama, preservando continuidade sem manter histórico ilimitado.
- Prompt do Assistente reforçado para perguntar quando faltar informação essencial antes de executar tools.
- Calendário voltou a ter gerenciamento visual de eventos: criação, edição, exclusão, cores, horários e observações diretamente na aba **Calendário**.
- Eventos recorrentes com repetição mensal ou anual; aniversários podem ser salvos uma vez e aparecer nos anos seguintes.
- Assistente local agora entende e gerencia repetição de eventos via `recurrence` (`none`, `monthly`, `yearly`).
- Schema nativo Tauri/Rust atualizado para preservar `recurrence` ao carregar e salvar o estado local.

- Aba **Neural** — notas conectadas por `[[links]]`, backlinks, menções não vinculadas, busca rápida e grafo local persistido em `neuralNotes`.
- Revisão da aba **Neural** com preservação de alias/headings em rename, criação de notas a partir de links pendentes, nós pendentes no grafo local e sincronização mais segura do editor.

- Aba **Mídia** — sessão SMTC (Windows), capas HD resolvidas no backend Rust, controles de reprodução
- Aba **Sistema** — CPU, RAM, temperatura (WMI) e apps com janela visível ([`docs/PLAN-METRICS.md`](docs/PLAN-METRICS.md))
- Comandos Tauri de mídia: `get_media_snapshot`, `get_media_artwork`, `media_toggle_playback`, `media_skip_next`, `media_skip_previous`
- Feature flags em [`src/lib/features.ts`](src/lib/features.ts): `OPENCODE_TAB_ENABLED`, `VIVARIUM_ENABLED`

### Changed

- Aba **OpenCode** oculta na UI — tab removida de `TaskHeader.svelte`, blocos comentados em `TaskPanel.svelte` (código e comandos Tauri permanecem; ver [`docs/AUDIT-FEATURE-OPENCODE.md`](docs/AUDIT-FEATURE-OPENCODE.md))
- Painel **Vivarium** permanece arquivado (`VIVARIUM_ENABLED = false`)

## [0.1.0] - 2026-05-22

### Added

- Calendário mensal com eventos e integração com tarefas
- Painel de arquivos com navegação local
- Terminal OpenCode integrado
- Seletor de monitor e preferência persistente
- Autostart com Windows
- Exportação de backup do estado local
- Testes unitários básicos (Vitest)
- CI com build web automatizado

### Security

- Content Security Policy em produção (Tauri + HTML)
- Remoção de DevTools em builds de release
- Desabilitação de `withGlobalTauri`
- Validação de paths em comandos de filesystem
- Atualização de dependências com CVEs conhecidas

### Fixed

- Race condition na escrita atômica do estado
- Migração de versão do schema de persistência
- Focus trap e foco inicial nos modais
- Retry com backoff na API de câmbio
- Persistência do último diretório no painel Arquivos
- Acessibilidade: toast dismissível, roving tabindex no calendário, aria-describedby no composer
