# Plano técnico de responsividade desktop — FocusWall

## Escopo

O projeto é um dashboard desktop em Svelte/Vite/Tauri. O objetivo desta intervenção não é criar uma experiência mobile, mas corrigir a adaptação para notebooks e monitores menores, especialmente faixas como 1366x768, 1280x720, 1440x900 e janelas desktop entre aproximadamente 980px e 1680px de largura.

## Diagnóstico

1. O layout principal tinha uma quebra agressiva em 1200px que convertia a interface para uma coluna. Isso fazia o app assumir comportamento de tela estreita cedo demais, criando uma experiência desconfortável para notebooks.
2. O tamanho da coluna lateral era proporcional demais em monitores grandes e pouco controlado em notebooks. A consequência era perda de área útil no painel principal ou, em larguras menores, colapsos abruptos.
3. O app dependia de `height: 100vh` e `overflow: hidden` em várias camadas. Em alturas como 720px/768px, elementos como relógio, cotações, header, composer e listas competiam pelo mesmo espaço vertical.
4. Havia responsividade fragmentada: alguns painéis tinham breakpoints próprios, outros dependiam apenas de regras globais. Isso tornava o comportamento desigual entre Execução, Calendário, Arquivos, Sistema, Mídia e Neural.
5. Em Tauri, `html.is-tauri .app-shell` fixava padding em `1.25rem`, sobrescrevendo a camada responsiva global e neutralizando parte dos ajustes para notebooks.

## Estratégia adotada

A abordagem aplicada foi criar uma camada de responsividade desktop progressiva:

- manter o layout de duas colunas até 980px, evitando o empilhamento em notebooks;
- transformar dimensões críticas em tokens CSS controláveis;
- reduzir espaçamentos, fontes, paddings e gaps por faixa de largura;
- adicionar uma camada de compactação por altura para telas de 720px/768px;
- preservar rolagem interna nos painéis em vez de deixar o shell inteiro quebrar;
- deixar o empilhamento abaixo de 980px apenas como fallback de janela estreita, não como alvo principal.

## Breakpoints definidos

### Até 1680px

Primeiro nível de compactação. Reduz padding geral, gap entre colunas, largura máxima da rail e densidade das cotações. O layout continua confortável em monitores médios.

### Até 1440px

Faixa típica de notebook/monitor menor. A rail lateral passa a trabalhar com largura menor, as cotações deixam de insistir em duas colunas internas, o calendário reduz a área do detalhe lateral e os painéis de arquivos/sistema ficam mais densos.

### Até 1280px

Faixa crítica para notebooks pequenos. O app mantém duas colunas, mas reduz botões, tabs, relógio, composer, cards, task rows e calendário. Esta é a principal correção contra o comportamento anterior.

### Até 1100px

Faixa de segurança ainda desktop. Mantém duas colunas, mas permite tabs com rolagem horizontal e reduz navegação, composer e painéis auxiliares. O Neural reorganiza relações abaixo do editor.

### Até 980px

Fallback. Só aqui o layout vira uma coluna. Em Tauri, o shell deixa de forçar altura fixa para evitar corte de conteúdo caso a janela fique estreita demais.

### Altura até 840px

Compactação vertical para notebooks. Reduz padding, header, tabs, cards, listas e tabelas sem remover conteúdo.

### Altura até 720px

Compactação mais agressiva, ainda preservando elementos. Reduz textos auxiliares, sparkline, composer e paddings de linhas/eventos para manter usabilidade em telas curtas.

## Alterações implementadas

### Tokens globais

Arquivo: `src/styles/tokens.css`

Foram adicionados tokens para controlar a responsividade sem espalhar valores fixos:

- `--shell-padding`
- `--shell-gap`
- `--rail-column`
- `--rail-padding`
- `--panel-padding`
- `--panel-inner-gap`

### Shell e rail lateral

Arquivo: `src/styles/layout.css`

- O shell agora usa tokens responsivos.
- O frame principal mantém duas colunas com `minmax` e `clamp`.
- A rail ganhou rolagem interna controlada para telas de baixa altura.
- Relógio, cards e cotações foram compactados com `clamp`.
- Valores monetários e sparklines reduzem gradualmente.

### Header, abas e painel de tarefas

Arquivo: `src/styles/tasks.css`

- O header deixou de depender de altura mínima fixa.
- O título principal usa escala mais segura para notebooks.
- Tabs foram reduzidas e preparadas para overflow horizontal controlado.
- O painel usa tokens de padding/gap.

### Composer, botões, lista e paginação

Arquivo: `src/styles/files-opencode.css`

- Composer ganhou grid mais flexível.
- Botões, inputs e cards passaram a usar medidas graduais.
- Progress summary usa colunas menores antes de quebrar.
- Task rows e ações foram compactadas para manter mais itens visíveis.

### Calendário

Arquivo: `src/styles/calendar.css`

- O grid principal e a coluna de detalhe foram rebalanceados.
- Toolbar, botões e células usam compactação progressiva.
- Formulários e grupos de cor mantêm estrutura desktop até faixas estreitas.

### Camada responsiva global

Arquivo: `src/styles/responsive.css`

- O arquivo foi reorganizado como uma camada desktop-first.
- A quebra para uma coluna saiu de 1200px e foi movida para 980px.
- Foram criadas regras específicas para 1680px, 1440px, 1280px, 1100px, 980px, 760px, 560px e alturas de 840px/720px.
- A preferência de movimento reduzido foi preservada.

### Tema/Tauri

Arquivo: `src/styles/themes.css`

- O padding fixo do shell Tauri foi trocado por `var(--shell-padding)`.
- O fallback de uma coluna em Tauri agora libera `overflow: auto` abaixo de 980px, evitando corte de conteúdo.

### Painel de arquivos

Arquivo: `src/lib/components/files/FilesPanel.svelte`

- A sidebar foi reduzida para notebooks.
- O breakpoint local foi ajustado para 1100px/980px.
- O seletor de sidebar foi convertido para `:global(.files-sidebar)`, removendo o warning de CSS não usado no build.

### Painel de sistema

Arquivos:

- `src/lib/components/system/SystemOverview.svelte`
- `src/lib/components/system/SystemAppsList.svelte`

- O overview passa para uma coluna em 1100px.
- A tabela de apps reduz altura e padding em telas baixas.

## Checklist de validação recomendado

1. Rodar em janela Tauri ou browser nas dimensões 1920x1080, 1440x900, 1366x768, 1280x720 e 1024x768.
2. Validar todas as abas: Execução, Calendário, Arquivos, Sistema, Mídia e Neural.
3. Conferir se a rail lateral não corta cotações em 720px/768px de altura; ela deve rolar internamente quando necessário.
4. Conferir se as tabs não quebram o header; em largura crítica devem rolar horizontalmente.
5. Conferir se o Calendário mantém grid e detalhe lado a lado até a faixa desktop mínima.
6. Conferir se Arquivos mantém sidebar lateral em notebooks e só empilha abaixo de 980px.
7. Conferir se o modo Tauri não ignora os tokens responsivos de padding.

## Validação executada nesta entrega

- `npm run build` passou.
- `npm run typecheck` passou.
- `npm run test -- --reporter=dot --no-file-parallelism --teardownTimeout=1000` passou: 16 arquivos e 70 testes.


## Revisão técnica adicional

Após a primeira implementação, foi feita uma segunda revisão focada em riscos que build e testes não capturam visualmente.

Correções e melhorias aplicadas nesta revisão:

- O navegador de histórico, quando inativo em abas como Arquivos, Sistema, Mídia e Neural, agora colapsa visualmente em vez de continuar ocupando largura no header. Isso libera espaço para título e tabs em notebooks.
- Foram adicionadas proteções de `min-width: 0` em blocos críticos de grid/flex para reduzir risco de overflow horizontal em conteúdo longo, especialmente tarefas, cotações e calendário.
- Foi criado um ajuste intermediário entre 981px e 1060px para preservar duas colunas, mas reduzir a rail lateral e a coluna de detalhe do calendário.
- O fallback abaixo de 980px agora posiciona o botão inferior da rail em largura total, evitando desalinhamento quando a rail vira grid.
- A compactação vertical recebeu uma faixa adicional em 780px de altura, cobrindo melhor notebooks 1366x768 sem esperar a regra mais agressiva de 720px.
- Foi removida uma regra duplicada global da tabela de aplicativos, mantendo a compactação local dentro do componente responsável.

## Segunda passada — Neural, Mídia e unificação de breakpoints

Após a auditoria de responsividade, foi aplicada uma segunda rodada focada em conflitos entre CSS local e a camada global.

### Neural

Arquivo: `src/styles/neural.css`

- Removidos breakpoints locais conflitantes (`1400px`, `920px`); toda a adaptação passa por `responsive.css`.
- Textarea, grafo e lower-grid usam `min-height` com `clamp()` em vez de valores fixos.
- `.neural-editor-shell` ganhou `min-height: 0` e `overflow: hidden` para permitir scroll interno quando relações têm `max-height`.

Arquivo: `src/styles/responsive.css`

- **1440px:** painel em duas colunas; relações em três colunas na base.
- **1100px:** relações abaixo do editor em grid 3 colunas com scroll; lower-grid e toolbar empilhados.
- **980px:** layout em coluna única; listas com `max-height`; relações em coluna flex.
- **840/780/720px (altura):** compactação de textarea, grafo e relações sem remover conteúdo.

### Mídia

Arquivo: `src/lib/components/media/media.css`

- `container-type` alterado de `inline-size` para `size` (largura e altura).
- Removidos fallbacks duplicados no viewport (`560px`, `640px` de altura); compactação via `@container media-panel`.
- Regra `@container (max-height: 640px)` para empilhar cena e mascarar arte.

Arquivo: `src/styles/responsive.css`

- Overrides em `.media-panel-root` para empty stage, info panel e EQ em telas baixas.
- Seletor corrigido: `.media-marquee-text` (antes `.media-now-playing-title`, inexistente).

### Calendário e rail

- **1280px:** detalhe do dia passa abaixo do grid (`grid-template-rows: 1fr auto`).
- **1060–981px:** rail mais estreita (`14.5rem`); calendário empilhado (grid + detalhe) nesta faixa intermediária.

### Arquivos e Sistema

- `FilesPanel.svelte`: removidos breakpoints de grid duplicados; sidebar controlada globalmente + `max-height` em `FilesSidebar.svelte` abaixo de 980px.
- `SystemOverview.svelte`: grid de overview unificado em `responsive.css`; componente mantém apenas padding local.

### Tauri

Arquivo: `src/styles/themes.css`

- Shell Tauri com `overflow-y: auto` em `@media (max-height: 840px)` para janelas baixas sem cortar conteúdo.

## Terceira passada — reorientação desktop-app-first (Tauri como base)

Esta passada inverte a polaridade da arquitetura: até aqui o CSS era *browser-first*
com overrides para Tauri. Como o alvo real é a janela nativa (`minWidth: 1100`,
`minHeight: 720`, `skipTaskbar` + `alwaysOnBottom` — um wall ancorado atrás de tudo),
a **base** passa a ser o modo Tauri e o navegador vira fallback explícito.

### (A) Polaridade `is-tauri` invertida + `--taskbar-height`

Arquivo: `src/styles/tokens.css`

- `--taskbar-height: 48px` é a reserva da **barra de tarefas real do Windows** no
  wall `alwaysOnBottom` — legítima no app. No preview de browser não há barra do SO,
  então `html:not(.is-tauri)` zera o token (`--taskbar-height: 0px`), eliminando os
  48px de padding inferior morto no preview.

### (B) Estratégia única de scroll — shell fixo, painéis rolam

Arquivos: `src/styles/layout.css`, `src/styles/themes.css`

- `.app-shell` usa `calc(100dvh - var(--taskbar-height))` (dvh casa melhor com a área
  útil do WebView2 que `vh`).
- **Removidos** os blocos que transformavam o dashboard em página rolável em altura
  baixa (`@media (max-height: 840px)` e `@media (max-width: 980px)` sob `html.is-tauri`
  em `themes.css`). No Tauri o `body` **nunca** rola: o shell é fixo e cada coluna
  (rail / painel ativo) rola internamente. Em 720–840px de altura a resposta é
  **compactar** (blocos de altura preservados), não rolar o corpo. Isso corrige o P0
  em que 1366×768 — notebook mais comum, dentro do range Tauri — virava página.

### (C) Calendário sem zig-zag de eixo

Arquivo: `src/styles/responsive.css`

- Removido o re-flip do `.calendar-body` para lado-a-lado no bloco de 1100px. O detalhe
  do dia agora permanece **empilhado abaixo do grid** de forma consistente de 1100 a
  1280px (herdando a regra de 1280), em vez de alternar de eixo quatro vezes no range.

### (D) Faixas ≤1080px isoladas como fallback de browser

Arquivo: `src/styles/responsive.css`

- Os blocos `1060–981px`, `980px`, `760px` e `560px` (≈290 linhas que nunca disparam
  no Tauri, dado `minWidth: 1100`) foram envolvidos num único `html:not(.is-tauri)`
  via aninhamento CSS. Continuam servindo o preview de navegador (empilhamento em 1
  coluna, body rolável), mas saem do runtime do desktop e param de competir por
  especificidade com o CSS scoped dos componentes.
- As faixas de **altura** (840/780/720px) permanecem base: valem para Tauri e browser
  e apenas compactam — nunca trocam o modo de scroll.

### (E) Conflito scoped vs global resolvido

Arquivo: `src/lib/components/system/SystemOverview.svelte`

- Removido o `@media (max-width: 1100px)` local que divergia (`padding: 0.75rem`) da
  camada global (`0.65rem`). A compactação ≤1100px passa a ser governada só por
  `responsive.css`.

### Hierarquia de layout (estado-alvo)

```
html.is-tauri            overflow:hidden · --taskbar-height:48px
└─ body                  overflow:hidden            ← nunca rola
   └─ #app
      └─ main.app-shell  height: calc(100dvh - var(--taskbar-height)) · overflow:hidden
         └─ .app-shell-frame   grid · height:100% · min-height:0 · overflow:hidden
            ├─ .info-rail      overflow-y:auto   ← único scroll da coluna esquerda
            └─ .panel (aba)    overflow:hidden
                 └─ painel      overflow-y:auto  ← único scroll da coluna direita

html:not(.is-tauri)      --taskbar-height:0px · blocos ≤1080px (1 coluna, body rola)
```

### Breakpoints de largura efetivos no Tauri

Apenas **1100 / 1280 / 1440 / base(≥1440)** disparam no app — usados só para reflow de
grid. Densidade contínua fica por conta de `clamp()`/tokens; altura por `@media height`;
o painel de Mídia segue por `@container media-panel` (modelo a estender aos demais).

### Validação executada nesta passada

- `npm run build` passou (aninhamento `html:not(.is-tauri)` achatado corretamente no bundle).
- `npm run typecheck` passou.
- `npm run test` passou: 16 arquivos, 70 testes.

## Checklist de validação recomendado
