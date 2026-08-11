# Delivery Status — YouTube Music

## Implementado

- Aba **Mídia** substituída visualmente por **Música**, preservando o identificador interno `media` para compatibilidade de navegação.
- Biblioteca de playlists do usuário via YouTube Data API v3.
- OAuth 2.0 de aplicativo desktop com PKCE, `state` e callback loopback em `127.0.0.1`.
- Refresh token protegido pelo DPAPI do Windows; access token mantido apenas em memória.
- Player oficial YouTube IFrame integrado à UI do FocusWall, sem incorporar `youtube.com`/`music.youtube.com` como mini navegador.
- Controles FocusWall: play/pause, anterior, próxima, seek, volume, aleatório e repetição.
- Player pausado ao sair da aba Música para evitar reprodução oculta.
- Paginação de playlists e itens de playlist.
- Tela de configuração para OAuth Client ID e Client Secret do tipo Desktop app.
- CSP Tauri ajustada apenas para os hosts necessários ao player e thumbnails.
- WebView2 identifica o FocusWall nas requisições do player oficial com `Referer` fixo e escopo restrito aos hosts do YouTube, prevenindo erro 153 por ausência de identidade HTTP.
- Documentação de arquitetura, configuração e critérios de aceite.

## Compatibilidade preservada

- Nenhuma dependência NPM nova foi adicionada. Para acessar a API nativa já usada transitivamente pelo Tauri, `webview2-com = 0.38.2` e `windows-core = 0.61.2` foram adicionadas como dependências Cargo diretas e fixadas nas mesmas versões presentes no `Cargo.lock`.
- O ID interno da aba continua sendo `media` para reduzir impacto em preferências/layout existentes.
- O código SMTC legado permanece no repositório somente como referência/rollback, mas não é mais registrado nem inicializado pelo runtime Tauri.

## Validação executada neste ambiente

- Validação JSON do `tauri.conf.json`.
- Validação TOML dos arquivos de configuração/permissão.
- Verificação estrutural de comandos Tauri x permissões x wrappers frontend.
- Verificação estática de sintaxe JavaScript extraída dos componentes Svelte novos.
- Transpilação sintática isolada do serviço TypeScript `youtube-music.ts` com `tsc --noCheck`.
- Verificação de ausência de access/refresh token na camada frontend e paridade entre invokes, handlers e permissões Tauri.
- Revisão estática da integração `with_webview`/WebView2 e do filtro de `WebResourceRequested` usado para identificação do player.

## Limitações da validação

- O ambiente de execução usado para esta entrega não possui `cargo`/`rustc`, portanto não foi possível executar `cargo check`/`cargo test`.
- A instalação completa das dependências NPM não pôde ser concluída porque o registry disponibilizado no ambiente retornou HTTP 404 para `zimmerframe@1.1.4`; por isso `vite build` e `vitest` não puderam ser executados aqui.
- Antes de uma release, executar em uma máquina Windows com a toolchain oficial do projeto: `npm ci`, `npm test`, `npm run build` e `cargo test`/`cargo check` (ou os scripts equivalentes já adotados pelo projeto).
