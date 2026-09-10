# FocusWall /RADAR — Refactor visual v2

## 1. Objetivo

Refatorar integralmente a camada visual da rota/painel `/RADAR` sem alterar o contrato funcional já consolidado do Radar. O resultado deve transformar a tela em uma superfície editorial e operacional coerente com o FocusWall, aumentar a hierarquia de informação e preservar o comportamento existente de clima, notícias, ticker, cache, filtros, preferências, localização, preview interno e abertura externa.

A direção adotada é **editorial control room**: uma composição contínua, densa e legível, com sinais visuais precisos, bordas e grade discretas, tipografia hierarquizada e ausência de dependências gráficas remotas.

## 2. Estado atual analisado

O Radar já possuía uma arquitetura funcional madura antes desta revisão:

- `RadarPanel.svelte` controla ciclo de vida, request derivado, pausa, ativação e overlays;
- `radar-store.ts` mantém refresh, paginação, categoria e preview;
- `services/radar.ts` concentra a fachada IPC;
- o backend Tauri/Rust mantém rede externa, cache e segurança fora do frontend;
- componentes especializados já cobrem clima, notícias, localização, drawer e ticker;
- `radar.css` era a camada visual central;
- preferências e categorias já eram persistidas.

Portanto, este refactor não reimplementa o domínio nem muda providers, IPC, cache ou segurança. A intervenção é deliberadamente restrita à apresentação e à composição dos componentes existentes.

## 3. Problemas visuais identificados

### 3.1 Hierarquia

- clima, manchete, destaques e lista possuíam peso visual muito próximo;
- a temperatura atual não atuava como ponto focal operacional;
- metadados competiam com títulos e conteúdo principal;
- a transição entre clima e notícias tinha pouca sinalização de seção.

### 3.2 Densidade e leitura

- as métricas meteorológicas eram corretas, porém pouco escaneáveis;
- a previsão horária não possuía representação visual da condição;
- a lista de notícias não comunicava claramente prioridade/ordem;
- o ticker tinha baixa separação semântica do conteúdo principal.

### 3.3 Configuração

- categorias habilitadas e personalização eram disclosures separados;
- controles administrativos ocupavam espaço excessivo no fluxo editorial;
- a relação entre filtros de leitura e preferências persistidas não era visualmente clara.

### 3.4 Overlays

- seletor de localização e preview tinham aparência mais próxima de painéis auxiliares do que de overlays deliberados;
- faltava separação mais clara entre contexto de fundo e tarefa modal;
- estados de loading/erro precisavam compartilhar a mesma anatomia do drawer final.

### 3.5 Responsividade

- o layout precisava reagir à largura real do painel, não apenas ao viewport da aplicação;
- o Radar precisa coexistir com o restante da shell do FocusWall sem assumir largura total de tela;
- o conteúdo horizontal deve ser explicitamente contido.

## 4. Restrições do refactor

1. Não alterar APIs, comandos Tauri, modelos, store ou contratos de dados.
2. Não introduzir chamadas HTTP no frontend.
3. Não incluir bibliotecas de ícones, CSS frameworks ou assets remotos.
4. Não alterar ranking, deduplicação, providers, cache ou regras de stale/fresh.
5. Não alterar limites de persistência de preferências.
6. Não expor URL remota de artigo ou imagem.
7. Preservar abertura de artigo por ID opaco e preview interno.
8. Preservar focus trap, Escape e `inert` do conteúdo de fundo nos overlays.
9. Reutilizar tokens globais para `dark`, `light` e `olive`.
10. Respeitar `prefers-reduced-motion` e os padrões globais da aplicação.

## 5. Arquitetura visual alvo

### 5.1 Camada 1 — Masthead operacional

Responsabilidades visuais:

- identificar claramente o produto `RADAR`;
- expor estado fresh/stale/error/loading sem dominar o cabeçalho;
- exibir localização selecionada como contexto acionável;
- concentrar última atualização/cache/cooldown;
- manter refresh como única ação operacional primária do masthead.

Implementação:

- marca de sinal local em CSS;
- status pill semântico;
- location chip com truncamento seguro;
- grade responsiva por container query;
- refresh com ícone SVG local.

### 5.2 Camada 2 — Clima

Responsabilidades visuais:

- tornar temperatura e condição o principal ponto focal;
- organizar métricas em uma matriz comparável;
- tornar próximas horas rapidamente escaneáveis;
- manter atribuição do provider visível;
- separar previsão diária e alertas derivados sem sugerir alerta oficial.

Implementação:

- hero meteorológico com temperatura, condição, sensação e faixa min/max;
- oito células de métricas;
- glyph meteorológico SVG derivado do código WMO;
- até 12 horas na faixa horizontal contida;
- alertas com severidade, texto e rótulo de estimativa;
- previsão de sete dias em disclosure.

### 5.3 Camada 3 — Notícias

Responsabilidades visuais:

- comunicar a ordem editorial sem recalcular ranking no frontend;
- distinguir manchete, dois destaques e fila de leitura;
- manter procedência e recência visíveis;
- preservar fallback quando imagens não estão disponíveis.

Implementação:

- grid editorial com manchete dominante e stack de destaques;
- fallback de capa baseado em categoria, sem rede;
- fila compacta numerada a partir da quarta matéria;
- metadados subordinados ao título;
- filtros horizontais contidos.

### 5.4 Camada 4 — Configurações

Responsabilidades visuais:

- retirar controles administrativos do fluxo principal;
- preservar todas as opções existentes;
- manter categorias e personalização no mesmo contexto.

Implementação:

- um único `details` de personalização;
- popover com categorias habilitadas;
- campos existentes de tópicos, fontes e ticker;
- mesmas funções de persistência, limites e erros.

### 5.5 Camada 5 — Ticker

Responsabilidades visuais:

- atuar como faixa de sinais persistente;
- diferenciar label, valor, timestamp e variação;
- não disputar atenção com o conteúdo editorial.

### 5.6 Camada 6 — Overlays

#### Localização

- backdrop real;
- modal centralizado;
- busca com ícone e anatomia dedicada de loading;
- resultados com hierarquia nome/localização;
- remoção da localização no rodapé.

#### Preview de artigo

- backdrop real;
- drawer lateral desktop e largura total em containers estreitos;
- topbar persistente;
- capa, metadados, headline, resumo, tags e relacionadas;
- abertura externa somente no rodapé e somente quando autorizada pelo backend;
- loading e erro dentro da mesma superfície.

## 6. Componentização

### Novos componentes

- `RadarIcon.svelte`: conjunto mínimo de ícones SVG internos, sem dependência.
- `RadarWeatherGlyph.svelte`: glyph meteorológico baseado no código recebido.
- `radar-icons.ts`: tipo fechado dos ícones aceitos.

### Componentes refatorados

- `RadarMasthead.svelte`;
- `RadarWeatherStrip.svelte`;
- `RadarHourlyList.svelte`;
- `RadarArticleCover.svelte`;
- `RadarLeadArticle.svelte`;
- `RadarFeaturedArticle.svelte`;
- `RadarNewsItem.svelte`;
- `RadarNewsFeed.svelte`;
- `RadarTicker.svelte`;
- `RadarState.svelte`;
- `RadarSkeleton.svelte`;
- `RadarLocationPicker.svelte`;
- `RadarArticleDrawer.svelte`;
- `RadarPanel.svelte`;
- `radar.css`.

## 7. Responsividade

A estratégia é baseada em `container: radar / inline-size`, porque o espaço útil do Radar depende da shell desktop.

Breakpoints:

- `<= 74rem`: masthead em duas linhas; métricas 2 colunas; destaques mais compactos;
- `<= 56rem`: clima hero sobre métricas; notícias em coluna; destaques lado a lado;
- `<= 42rem`: masthead flexível; métricas 2 colunas; configuração compacta; lista de notícias com grid reduzido; drawer ocupa toda a largura;
- `<= 31rem`: localização e masthead simplificados; configurações em uma coluna; destaques menores;
- altura `<= 780px` em desktop: reduz alturas e paddings não essenciais.

Regra de overflow:

- painel, conteúdo, notícias e overlays não devem gerar overflow horizontal;
- a previsão horária é a única superfície com overflow horizontal intencional e contido.

## 8. Acessibilidade

Critérios preservados/reforçados:

- controles acionáveis continuam sendo `button`/`summary`/`input` sem `div` clicável;
- filtros mantêm `aria-pressed`;
- status e erros mantêm regiões apropriadas de anúncio;
- modal de localização e drawer mantêm `role="dialog"` e `aria-modal="true"`;
- focus trap e Escape permanecem ligados aos utilitários existentes;
- backdrop oferece ação explícita de fechamento;
- conteúdo da shell permanece `inert` enquanto overlay está aberto;
- ícones decorativos usam `aria-hidden="true"`;
- drawer usa `aria-labelledby` somente quando o título da matéria existe e `aria-label` nos estados transitórios;
- labels e legends persistem nos controles de personalização.

## 9. Segurança e privacidade

O refactor visual não altera a superfície de segurança. Foi mantido:

- zero `fetch()` novo na feature;
- zero HTML remoto (`{@html}`);
- imagens continuam vindo do mecanismo local existente;
- URLs não são introduzidas nos componentes;
- abertura externa continua delegada ao service por ID;
- localização continua sendo seleção explícita e persistida pelos fluxos existentes.

## 10. Performance

Decisões:

- SVGs são inline e pequenos;
- nenhuma biblioteca ou asset extra é carregado;
- imagens existentes mantêm lazy loading;
- animações permanecem restritas e são desativadas/reduzidas pela política existente;
- layout usa CSS nativo e container queries, sem medição JavaScript;
- lista de notícias não duplica nem reordena objetos para apresentação além dos slices já necessários;
- previsão mostra no máximo 12 horas no DOM dessa faixa.

## 11. Plano de implementação executado

### Fase A — Baseline

1. descompactar a origem sem alterar o arquivo enviado;
2. criar baseline Git local somente para obtenção do diff;
3. mapear componentes, stores, services, contratos e documentação Radar;
4. confirmar que domínio/cache/IPC/Rust estavam fora do escopo necessário.

### Fase B — Sistema visual

1. definir tokens locais derivados dos tokens globais;
2. definir eixo editorial único;
3. criar seção numerada e headings consistentes;
4. criar primitives de ícone e clima;
5. substituir aparência de cards administrativos por superfícies editoriais.

### Fase C — Clima

1. refatorar hero;
2. refatorar métricas;
3. incorporar glyphs;
4. expandir leitura horária para 12 pontos;
5. reorganizar alertas e sete dias.

### Fase D — Notícias

1. refatorar fallback de capa;
2. reforçar manchete;
3. compactar destaques;
4. numerar fila restante;
5. consolidar configurações em popover único.

### Fase E — Overlays

1. transformar seletor de localização em modal;
2. transformar preview em drawer com backdrop;
3. manter focus trap/Escape;
4. alinhar loading/error ao layout final;
5. revisar labeling acessível nos estados transitórios.

### Fase F — Responsividade e temas

1. container queries;
2. matriz de larguras 1366/1024/800;
3. inspeção em dark/light/olive;
4. detecção de overflow por Chromium;
5. verificação da rolagem horária contida.

### Fase G — Revisões

#### Revisão 1 — Escopo e comportamento

- sem alteração de service/store/backend;
- funções de save/filter/refresh/open preservadas;
- nenhum provider novo;
- nenhuma dependência nova.

#### Revisão 2 — Estrutura e consistência

- scripts TypeScript de todos os componentes Radar analisados por transpile sintático;
- blocos Svelte e chaves CSS balanceados;
- classes Radar cruzadas entre markup e CSS;
- `git diff --check` aplicado ao diff final.

#### Revisão 3 — UX, responsividade e acessibilidade

- fixture visual renderizado em Chromium com os tokens reais da aplicação;
- dark/light/olive verificados;
- 1366, 1024 e 800 px verificados;
- painel sem overflow horizontal;
- faixa horária com overflow intencional;
- labeling do drawer revisado para loading/erro/ready.

## 12. Critérios de aceite

### Visual

- [x] Radar possui identidade visual clara sem se desconectar do FocusWall.
- [x] Clima é o primeiro bloco operacional e tem hierarquia superior às métricas.
- [x] Notícias distinguem manchete, destaques e fila.
- [x] Configurações deixam de competir com o conteúdo principal.
- [x] Ticker funciona como faixa persistente de sinais.
- [x] Localização e artigo usam overlays deliberados.

### Funcional

- [x] request Radar permanece derivado das mesmas preferências.
- [x] refresh manual preservado.
- [x] cooldown preservado.
- [x] categoria selecionada preservada.
- [x] categorias habilitadas preservadas.
- [x] personalização e limites preservados.
- [x] paginação preservada.
- [x] preview por ID preservado.
- [x] abertura externa preservada.
- [x] busca de localização/debounce/generation preservados.

### Segurança

- [x] sem rede nova no frontend.
- [x] sem HTML remoto.
- [x] sem URL remota em imagem adicionada.
- [x] sem dependência externa nova.

### Responsividade

- [x] nenhum overflow horizontal do painel nas larguras renderizadas.
- [x] previsão horária rolável dentro do próprio container quando necessário.
- [x] temas dark/light/olive renderizados com tokens globais.

## 13. Revisão completa pós-implementação

Após a primeira geração do patch foi executada uma segunda auditoria integral, orientada a defeitos de borda e não apenas à composição visual. Os seguintes pontos foram encontrados e corrigidos antes desta versão final:

1. **Glyph WMO 85/86**: pancadas de neve eram desenhadas como condição genérica. O glyph agora deriva da função canônica `weatherCodeToMessageKey`, eliminando duplicação da tabela WMO e também impedindo que códigos desconhecidos altos sejam classificados indevidamente como tempestade.
2. **Exatamente duas notícias**: o stack de destaques mantinha uma segunda linha vazia. O estado de um único destaque agora usa layout de uma linha.
3. **Busca de localização em loading**: o skeleton havia perdido o texto acessível presente na versão anterior. Foi adicionado status somente para leitores de tela sem contaminar os blocos visuais de shimmer.
4. **Semântica da lista de localização**: `role=list` deixou de envolver estados de loading/erro/prompt e passou a existir somente quando há resultados; erros de busca usam `role=alert`.
5. **Popover de configurações**: Escape fecha o `details` e devolve foco ao `summary`, preservando navegação por teclado.
6. **Live regions duplicadas**: o masthead deixou de criar uma região live redundante ao redor de um status que já possui `role=status`.
7. **Drawer em erro**: título semântico e topbar agora apresentam o mesmo estado de erro; não existe mais mensagem de “carregando” residual após falha.
8. **Região principal**: o `aria-label` do Radar passou a estar associado a `role=region`, tornando o nome efetivamente exposto pela árvore de acessibilidade.
9. **Contraste**: textos antes baseados diretamente em `--ink-soft`, `--ink-muted`, `--accent-sky` e `--danger` receberam tokens locais derivados do tema. Na aproximação sobre os fundos-base dos três temas, os novos níveis mínimos calculados ficam acima de 4,5:1 no dark, light e olive.
10. **Escala tipográfica**: metadados abaixo de `0.6rem` foram elevados para pelo menos `0.6rem`; textos críticos permanecem em escalas superiores.
11. **Target size**: o controle de atribuição meteorológica passou a ter altura mínima de `2rem` (32 CSS px).
12. **Código morto**: o glyph `clock` não utilizado foi removido do primitive de ícones e do union type.
13. **Qualidade do patch**: os arquivos existentes que usam CRLF tiveram o terminador original restaurado, removendo ruído de diff por normalização de EOL e mantendo o patch focado em mudanças lógicas/visuais.

### 13.1 Verificações estáticas repetidas após as correções

- `git diff --check`;
- transpile sintático TypeScript de todos os `<script lang="ts">` do Radar;
- balanceamento de blocos Svelte e chaves CSS;
- auditoria de chaves i18n literais contra `messages.ts`;
- auditoria de IDs/`aria-labelledby`/`aria-describedby`/`aria-controls`;
- auditoria de classes de markup contra CSS;
- varredura de `fetch`, `XMLHttpRequest`, `WebSocket`, `{@html}`, `innerHTML`, `eval`, URLs remotas, `@import` e cores literais;
- confirmação de que `package.json`, `package-lock.json`, stores, services, IPC e Rust permanecem fora do diff;
- comparação de EOL com o baseline para evitar alterações cosméticas de CRLF/LF.

## 14. Validações executadas nesta revisão

Aprovadas no ambiente disponível:

- transpilação sintática TypeScript dos blocos `<script lang="ts">` dos componentes Radar usando o TypeScript global;
- balanceamento dos blocos Svelte condicionais/loops;
- balanceamento das chaves de `radar.css`;
- cruzamento de classes principais entre Svelte e CSS;
- `git diff --check`;
- inspeção visual da composição-base em Chromium com CSS real nos temas dark/light/olive;
- inspeção da composição-base em 1366×768, 1024×720 e 800×720;
- medição da composição-base do `scrollWidth`: painel e notícias sem overflow horizontal; hourly scroll contido;
- após a auditoria pós-implementação, o binário Chromium do sandbox deixou de produzir screenshot até para `about:blank`; portanto, as correções finais de contraste/estados foram validadas estaticamente, e a matriz visual final deve ser repetida no ambiente oficial.

Bloqueados pelo ambiente:

- `npm ci` não conclui neste sandbox; dependências npm não ficam disponíveis;
- por consequência, `npm run typecheck`, `npm test` e `npm run build` não podem ser considerados executados com o compilador Svelte/Vite real nesta rodada;
- o aplicativo Tauri desktop não foi iniciado para interação real.

Esses bloqueios são de validação de ambiente e não devem ser omitidos na homologação. O patch deve passar pela pipeline oficial do projeto antes de release.

## 15. Homologação recomendada antes de produção

1. `npm ci` em registry funcional;
2. `npm run typecheck`;
3. `npm test`;
4. `npm run build`;
5. iniciar Tauri no Windows/WebView2 suportado;
6. validar dark/light/olive;
7. validar 1100×720, 1366×768 e 1920×1080;
8. validar zoom 125% e 150%;
9. validar teclado completo no settings, localização e drawer;
10. validar offline/fresh/stale/error/partial/cooldown;
11. validar artigos com imagem, sem imagem, título longo, resumo longo e tags longas;
12. validar troca rápida de localização e fechamento por Escape/backdrop;
13. validar que nenhum request HTTP partiu do WebView.

## 16. Risco residual

Os riscos residuais relevantes são a ausência de compilação Svelte/Vite/testes oficiais neste sandbox por indisponibilidade das dependências npm e a impossibilidade de repetir a captura Chromium depois das últimas correções, pois o binário passou a falhar inclusive em `about:blank`. A composição-base já havia sido renderizada e as alterações posteriores foram revisadas estaticamente, mas isso não substitui a pipeline de build nem a homologação WebView2 do projeto.

