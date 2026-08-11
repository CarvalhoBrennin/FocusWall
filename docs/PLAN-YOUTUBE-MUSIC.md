# FocusWall Music — YouTube / YouTube Music

## Objetivo

Substituir a antiga aba **Mídia / SMTC** por uma experiência de música integrada ao FocusWall, sem depender de Spotify Premium, aplicativo externo ou navegação pelo site do YouTube.

O usuário deve poder:

1. conectar sua conta Google/YouTube;
2. visualizar playlists próprias do YouTube/YouTube Music;
3. abrir uma playlist e visualizar suas faixas;
4. iniciar a reprodução dentro do FocusWall;
5. controlar play/pause, anterior/próxima, seek, volume, shuffle e loop;
6. manter a experiência visual do FocusWall.

## Decisões arquiteturais

### 1. YouTube Data API no backend Rust

O frontend não recebe access token nem refresh token. Os comandos Tauri fazem as chamadas autenticadas à YouTube Data API e devolvem somente modelos normalizados de playlist/faixa.

Fluxo:

```text
MusicPanel.svelte
      |
      v
src/lib/services/youtube-music.ts
      |
      v
Tauri invoke
      |
      v
src-tauri/src/youtube_music.rs
      |
      +--> OAuth 2.0 / PKCE
      +--> YouTube Data API v3
```

### 2. OAuth de aplicativo desktop com PKCE

- O Client ID e o Client Secret da credencial Desktop são configuráveis na própria aba Música e ficam em `AppData/youtube-music.json`.
- O login abre o navegador do sistema, conforme o fluxo recomendado para aplicativo instalado.
- Redirect usa listener efêmero em `127.0.0.1:<porta aleatória>`.
- A requisição usa PKCE `S256` e `state` aleatório para proteção contra interceptação/CSRF.
- Escopo único: `https://www.googleapis.com/auth/youtube.readonly`.

### 3. Refresh token protegido pelo Windows

O refresh token é persistido separadamente em `AppData/youtube-music-token.bin` e protegido com Windows DPAPI no contexto do usuário atual.

O access token é mantido somente em memória e renovado quando necessário.

### 4. Reprodução pelo YouTube IFrame Player API

A reprodução ocorre no componente `YouTubePlayer.svelte` usando o player oficial do YouTube.

O player recebe um array de `videoId` obtido da playlist pela Data API. O iframe permanece visível e a UI do FocusWall oferece os controles externos.

Ao sair da aba Música, a reprodução é pausada para não manter um player invisível executando em background.

## Estrutura implementada

```text
src/lib/components/music/
├── MusicPanel.svelte
├── YouTubePlayer.svelte
└── music.css

src/lib/services/
└── youtube-music.ts

src-tauri/src/
├── youtube_music.rs
└── webview_identity.rs
```

A aba continua usando internamente `panelTab === 'media'` para preservar compatibilidade com a navegação existente, mas o rótulo exibido passa a ser **Música**.

## Comandos Tauri

- `youtube_music_get_auth_status`
- `youtube_music_save_client_id`
- `youtube_music_connect`
- `youtube_music_disconnect`
- `youtube_music_list_playlists`
- `youtube_music_list_playlist_items`
- `youtube_music_open_google_console`
- `youtube_music_open_api_library`

## Fluxos

### Configuração inicial

```text
Música
  -> informar OAuth Client ID + Client Secret (Desktop app)
  -> salvar
  -> conectar conta
  -> navegador do sistema abre consentimento Google
  -> callback em 127.0.0.1
  -> backend troca code + verifier por tokens
  -> refresh token protegido por DPAPI
  -> playlists carregadas
```

### Biblioteca

```text
GET /youtube/v3/playlists
  part=snippet,contentDetails
  mine=true
  maxResults=50
  + paginação por nextPageToken
```

### Faixas

```text
GET /youtube/v3/playlistItems
  part=snippet,contentDetails,status
  playlistId=<id validado>
  maxResults=50
  + paginação por nextPageToken
```

### Reprodução

```text
playlistItems -> videoId[]
                    |
                    v
YT.Player.loadPlaylist(videoId[], index, 0)
                    |
       +------------+-------------+
       |            |             |
     pause        seek          volume
     next         shuffle       loop
     previous
```

## Segurança

- tokens não são expostos ao WebView;
- refresh token protegido por DPAPI;
- Client Secret armazenado somente na configuração local do usuário;
- PKCE S256;
- `state` OAuth obrigatório;
- listener OAuth limitado a loopback (`127.0.0.1`) e porta aleatória;
- timeout de 180 segundos no retorno OAuth;
- Client ID e playlist ID validados antes do uso;
- HTTP externo com TLS e timeout;
- erros externos truncados antes de propagação;
- chamadas GET à Data API têm retry limitado para timeout/conexão, HTTP 429 e erros 5xx;
- logs registram apenas eventos técnicos/contagens, nunca tokens;
- CSP libera somente os hosts necessários ao player/thumbnails, sem `*`;
- no Windows, o WebView2 preserva o `Referer` real e usa `http://tauri.localhost/` como fallback apenas nas requisições do player para `youtube.com`/`youtube-nocookie.com`, atendendo à identificação exigida para embeds sem enviar credenciais;
- comandos que abrem navegador usam URLs fixas no Rust, não URL fornecida pelo frontend.

## Privacidade / LGPD

O FocusWall solicita somente acesso de leitura ao YouTube. Não solicita senha Google, não grava histórico de autenticação e não persiste access token. A credencial de longa duração fica vinculada ao usuário do Windows via DPAPI.

A desconexão atual remove a credencial local do computador. Ela não revoga automaticamente o grant na conta Google; revogação global pode ser feita nas configurações da Conta Google.

## Compatibilidade e limitações conhecidas

1. A primeira configuração exige criar um projeto/Client ID no Google Cloud e habilitar YouTube Data API v3; a implementação usa a cota padrão da API e não adiciona dependência de plano pago ao FocusWall.
2. Se a audiência OAuth estiver em modo **Testing**, autorizações de usuários de teste e respectivos refresh tokens expiram após 7 dias; o usuário precisará reconectar ou ajustar o status de publicação conforme as regras do Google.
3. A listagem desta versão usa `playlists.list(mine=true)`: o escopo funcional é **playlists pertencentes ao usuário autenticado**.
4. Playlists algorítmicas específicas do YouTube Music (ex.: mixes automáticos) não são tratadas como API pública garantida.
5. Alguns vídeos podem negar reprodução incorporada (erros 101/150) ou deixar de existir (100). O erro 153 é tratado explicitamente e indica falha na identificação HTTP do player incorporado.
6. Anúncios, restrições regionais/etárias e demais decisões do player oficial permanecem sob controle do YouTube.
7. Ao trocar para outra aba do FocusWall, a reprodução é pausada deliberadamente.

## Critérios de aceite

### Configuração

- Given que o Client ID não foi configurado, When a aba Música abrir, Then a tela de configuração deve ser exibida.
- Given um Client ID inválido, When salvar, Then o backend deve rejeitar sem persistir credencial.
- Given um Client ID válido, When conectar, Then o navegador do sistema deve abrir o OAuth Google com PKCE e `youtube.readonly`.

### Biblioteca

- Given usuário autenticado, When a aba Música carregar, Then suas playlists próprias devem ser listadas.
- Given mais de 50 playlists/faixas, When a API retornar `nextPageToken`, Then o backend deve continuar a paginação.

### Player

- Given uma playlist carregada, When o usuário clicar em Tocar ou em uma faixa, Then o player oficial deve carregar os IDs da fila.
- Given uma faixa em reprodução, When usar play/pause/seek/volume/next/previous/shuffle/loop, Then o comando deve refletir no `YT.Player`.
- Given que a aba Música fica inativa, Then o player deve pausar.
- Given erro 100/101/150/153, Then a UI deve exibir mensagem compreensível sem derrubar o dashboard.

## Validação prevista

```text
npm run typecheck
npm test
npm run build
cargo test
cargo check
```

No ambiente em que esta alteração foi preparada, as dependências Node não puderam ser restauradas porque o registry intermediário não continha `zimmerframe@1.1.4`, e o toolchain Rust (`cargo`/`rustc`) não estava instalado. Portanto, a entrega inclui validação estática/estrutural e registra explicitamente que build/test completos precisam ser executados em ambiente de desenvolvimento com Node dependencies e Rust disponíveis.
