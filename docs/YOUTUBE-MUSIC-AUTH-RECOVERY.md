# Recuperação de autorização do YouTube Music

## Objetivo

Substituir a exposição do erro técnico de OAuth (`invalid_grant`) por um fluxo explícito de recuperação quando o refresh token do YouTube expirar ou for revogado.

A mudança mantém a arquitetura atual da integração: OAuth 2.0 Desktop, PKCE S256, callback loopback, YouTube Data API v3, refresh token protegido por Windows DPAPI e access token apenas em memória.

## Estado anterior

Quando uma chamada da biblioteca precisava renovar o access token e o Google rejeitava o refresh token, o backend retornava ao frontend o status HTTP e o corpo bruto recebido do endpoint OAuth. O painel Música preservava o estado `authenticated` carregado anteriormente e exibia a mensagem em um toast genérico.

Consequências:

- o usuário via `400 Bad Request`, `invalid_grant` e `error_description`, detalhes de protocolo que não ajudam na recuperação;
- a biblioteca permanecia visualmente no estado conectado até que uma nova leitura de autenticação ocorresse;
- o erro competia com a tela vazia da biblioteca em vez de oferecer uma ação principal;
- não havia diferenciação estável entre autorização revogada e falhas comuns de transporte/configuração;
- respostas concorrentes já iniciadas podiam continuar atualizando a superfície após a invalidação da sessão.

## Arquitetura implementada

### Backend Rust

`src-tauri/src/youtube_music.rs` passa a interpretar a resposta OAuth de refresh.

Quando `error == "invalid_grant"`:

1. o refresh token rejeitado é removido do armazenamento local protegido;
2. o access token em memória é descartado;
3. caches de playlists e faixas são invalidados;
4. o backend registra somente informação operacional controlada em log;
5. o comando Tauri retorna o sinal estável `FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED`.

O corpo bruto retornado pelo Google não é propagado para a UI nesse fluxo.

Falhas de refresh que não sejam `invalid_grant` continuam como erro operacional, mas também deixam de expor o corpo bruto do endpoint OAuth ao frontend. O log preserva status HTTP e código OAuth, quando disponível, sem registrar refresh token ou access token.

### Service TypeScript

`src/lib/services/youtube-music.ts` centraliza as chamadas Tauri da integração em `musicInvoke()`.

O sinal do backend é normalizado para:

- `YouTubeMusicError`;
- código estável `AUTH_RECONNECT_REQUIRED`;
- mensagem segura e independente do payload externo.

Componentes não precisam interpretar strings do Google nem conhecer `invalid_grant`.

### Estado do painel

`MusicPanel.svelte` possui estado explícito de recuperação:

- `reconnectRequired`;
- `reconnectFailed`.

Ao receber `AUTH_RECONNECT_REQUIRED`, `enterAuthRecovery()`:

1. incrementa as sequências das requisições de playlists e faixas, invalidando respostas em voo;
2. marca a autenticação local como não autenticada;
3. encerra estados de loading associados à biblioteca;
4. limpa playlists, playlist selecionada, faixas e reprodução corrente;
5. retorna a navegação interna para a biblioteca;
6. remove toast de erro e mensagem informativa anteriores;
7. ativa a superfície de recuperação.

Isso evita que conteúdo obtido antes da rejeição do token reapareça por uma resposta assíncrona atrasada.

## Nova superfície de recuperação

`YouTubeAuthRecovery.svelte` substitui a biblioteca e o toast quando a sessão é invalidada em runtime.

A tela apresenta:

- indicação clara de que a autorização precisa ser renovada;
- explicação de que a configuração OAuth local foi preservada;
- sequência de três passos para reconectar;
- ação primária **Reconectar YouTube**;
- ação secundária **Configurações OAuth**;
- feedback específico enquanto o navegador está aguardando autorização;
- erro de reconexão amigável, sem payload técnico do provedor.

A ação de configurações abre diretamente a seção `media` do modal global, sem exigir que o usuário navegue manualmente desde Aparência.

## Fluxo ponta a ponta

```text
Música carregada
  -> getMusicAuthStatus(): authenticated=true
  -> listYouTubePlaylists()
  -> access token ausente/expirando
  -> refresh_access_token()
  -> Google OAuth: invalid_grant
  -> remover refresh token rejeitado
  -> limpar access token + caches
  -> FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED
  -> YouTubeMusicError(AUTH_RECONNECT_REQUIRED)
  -> MusicPanel.enterAuthRecovery()
  -> tela de reconexão
  -> usuário seleciona Reconectar YouTube
  -> OAuth Desktop + PKCE + navegador do sistema
  -> callback loopback
  -> novo refresh token protegido por DPAPI
  -> refresh da biblioteca
```

## Segurança e privacidade

A implementação não altera os escopos OAuth. A integração permanece com `youtube.readonly`.

Controles preservados ou reforçados:

- refresh token protegido pelo Windows DPAPI;
- access token somente em memória;
- nenhum token é inserido em DOM, toast ou mensagem de recuperação;
- o corpo bruto de erro do endpoint de refresh não chega ao frontend;
- logs do novo fluxo contêm apenas status/código operacional, nunca token;
- Client ID e Client Secret não são apagados quando apenas a autorização do usuário expira/revoga;
- não há nova dependência JavaScript/Rust;
- não há novo endpoint, host externo ou relaxamento de CSP;
- a autorização usa o fluxo OAuth já existente com PKCE e `state`.

Observação: Client ID e Client Secret são configuração do aplicativo Desktop; o refresh token representa a autorização da conta. A recuperação remove apenas a autorização rejeitada.

## Concorrência e consistência

A invalidação no backend ocorre sob o fluxo serializado por `refresh_lock`, impedindo refreshes concorrentes de manter um token recusado.

No frontend, `playlistsRequestSequence` e `tracksRequestSequence` são incrementados ao entrar na recuperação. Respostas antigas deixam de satisfazer a sequência esperada e são descartadas.

O estado visual não depende de aguardar uma segunda chamada a `getMusicAuthStatus()`: a sessão é invalidada imediatamente após o erro tipado.

## Acessibilidade

A superfície possui:

- região com título via `aria-labelledby`;
- feedback de reconexão com `role="status"`;
- falha de reconexão com `role="alert"`;
- elementos puramente decorativos marcados com `aria-hidden="true"`;
- botões nativos, estado `disabled` e focus ring do design system;
- targets das ações de recuperação com altura mínima de 2,55 rem;
- textos funcionais usando contraste mais forte que os elementos decorativos;
- breakpoints por container para preservar leitura em painéis estreitos.

## i18n

Todas as mensagens novas possuem versões PT-BR e EN em `src/lib/i18n/messages.ts`. A UI não depende do texto retornado pelo Google para decidir o estado de recuperação.

## Testes adicionados

### TypeScript

`src/lib/services/youtube-music.test.ts` cobre:

- mapeamento do sinal estável para `YouTubeMusicError`;
- identificação de `AUTH_RECONNECT_REQUIRED`;
- garantia de que `invalid_grant`/descrição bruta não vazam na mensagem normalizada;
- preservação de erros comuns existentes;
- normalização de rejeições que não sejam instâncias de `Error`.

### Rust

O módulo de testes de `youtube_music.rs` passa a cobrir o parsing do código `invalid_grant` recebido do endpoint OAuth.

## Critérios de aceite

### Expiração/revogação

**Given** uma instalação com configuração OAuth válida e refresh token armazenado
**And** o Google rejeita esse refresh token com `invalid_grant`
**When** a biblioteca ou uma playlist tenta renovar a autorização
**Then** o usuário não vê o JSON/HTTP bruto do Google
**And** a biblioteca conectada deixa de ser exibida
**And** a tela de reconexão aparece
**And** o refresh token rejeitado é removido localmente
**And** caches e access token são invalidados.

### Reconexão

**Given** a tela de reconexão
**When** o usuário seleciona **Reconectar YouTube**
**Then** o fluxo OAuth existente é iniciado no navegador
**And** após autorização bem-sucedida a tela de recuperação desaparece
**And** as playlists são recarregadas.

### Falha durante reconexão

**Given** uma reconexão em andamento
**When** o fluxo não é concluído
**Then** a tela permanece no modo de recuperação
**And** apresenta feedback amigável
**And** não renderiza o payload técnico do provedor.

### Configuração OAuth

**Given** a tela de recuperação
**When** o usuário seleciona **Configurações OAuth**
**Then** o modal global abre diretamente na seção da integração YouTube.

### Concorrência

**Given** uma requisição de playlists/faixas em voo
**When** outra chamada detecta `invalid_grant`
**Then** a resposta antiga não restaura dados da sessão inválida na UI.

## Matriz de homologação recomendada

1. Token válido: Música abre normalmente e lista playlists.
2. Refresh token artificialmente revogado: primeira renovação entra na tela de recuperação.
3. Conta desconectada pelo Google: mesmo comportamento do item anterior.
4. Reconexão concluída: biblioteca volta sem reiniciar o aplicativo.
5. Reconexão cancelada/timeout: tela permanece e mostra feedback amigável.
6. Client ID/Secret inválidos: não devem ser classificados como sessão expirada.
7. Sem rede: não deve apagar autorização válida nem classificar como `AUTH_RECONNECT_REQUIRED`.
8. Duas chamadas simultâneas que exigem refresh: somente uma renovação é executada e a invalidação permanece consistente.
9. Temas dark/light/olive.
10. Larguras do painel equivalentes a 1366x768, 1024x720 e 800x720, além de zoom 125%/150% no WebView2.
11. Navegação integral por teclado e leitura dos estados `status`/`alert` com tecnologia assistiva.

## Pendências de validação do ambiente desta entrega

O ambiente de execução usado para preparar o patch não possui uma instalação completa das dependências Node do projeto e não dispõe de toolchain Cargo/Rust utilizável. Também apresentou falha de infraestrutura ao iniciar Chromium headless para uma nova captura visual.

Portanto, antes do merge/release ainda são gates obrigatórios no ambiente oficial:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

E, no ambiente Rust/Tauri configurado:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

A homologação final deve ocorrer no executável Tauri/WebView2 Windows, incluindo o cenário real de revogação/expiração do refresh token.

