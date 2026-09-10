# Configuração gratuita do YouTube no FocusWall

A integração não exige Spotify, assinatura Premium nem servidor próprio. Ela utiliza a cota padrão da YouTube Data API; para acessar suas playlists privadas/pessoais, o Google exige que o aplicativo use um OAuth Client ID.

## Google Cloud

1. Abra o Google Cloud Console.
2. Crie ou selecione um projeto.
3. Ative **YouTube Data API v3**.
4. Configure a tela de consentimento OAuth.
5. Se o app estiver em modo de teste, adicione sua conta Google como usuário de teste.
6. Crie **OAuth client ID** com tipo **Desktop app**.
7. Baixe o JSON da credencial e mantenha juntos o **Client ID** e o **Client Secret**.

O FocusWall usa PKCE e não trata o Client Secret de um aplicativo Desktop como segredo de servidor. Ainda assim, não publique esse valor em repositórios nem o compartilhe; ele fica salvo somente na configuração local do Windows.

> **Atenção ao modo Testing:** para usuários de teste, o Google expira a autorização e o refresh token após 7 dias. Nesse caso o FocusWall solicitará uma nova conexão. Para uso contínuo, configure o status de publicação/audiência do projeto conforme as regras atuais do Google para o seu cenário.

## FocusWall

1. Abra **Música**.
2. Cole o **Client ID** e o **Client Secret** da mesma credencial.
3. Clique **Salvar configuração**.
4. Clique **Conectar minha conta**.
5. Autorize no navegador do sistema.
6. Volte ao FocusWall; as playlists serão carregadas automaticamente.

## Dados locais

- `youtube-music.json`: Client ID, Client Secret e configuração local.
- `youtube-music-token.bin`: refresh token protegido pelo Windows DPAPI.

Para desconectar apenas este computador, use **Sair** na aba Música.

## Autorização expirada ou revogada

Se o Google rejeitar o refresh token com `invalid_grant`, o FocusWall descarta a autorização inválida e mostra uma tela dedicada de reconexão. O **Client ID** e o **Client Secret** permanecem salvos; normalmente basta clicar em **Reconectar YouTube** e concluir novamente a autorização no navegador.

Esse fluxo também cobre a expiração periódica de autorizações em projetos OAuth configurados como **Testing**. Se a reconexão falhar por configuração da credencial, use **Configurações OAuth** na própria tela de recuperação.

## Player incorporado no Windows

O FocusWall configura o WebView2 para identificar o aplicativo nas requisições do player oficial do YouTube. O WebView2 preserva o `Referer` real quando ele existe (inclusive no servidor de desenvolvimento) e usa `http://tauri.localhost/` como fallback no executável empacotado. Essa configuração é aplicada somente aos hosts do player e evita o erro 153 causado por WebViews sem identidade HTTP. Nenhum token OAuth é colocado nesse cabeçalho.
