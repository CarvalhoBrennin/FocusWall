# Plano e implementação — Aba Neural

## Objetivo

Adicionar ao Focus Dashboard uma aba de conhecimento conectado inspirada no fluxo de notas interligadas do Obsidian. A aba transforma notas soltas em uma rede navegável: cada nota pode apontar para outras com links internos, exibir backlinks e revelar relações em grafo local.

## Modelo mental

- **Nota**: unidade de conhecimento com `title`, `content`, `createdAt` e `updatedAt`.
- **Link interno**: referência textual no formato `[[Título da nota]]`; também aceita alias `[[Título|alias]]`, heading `[[Título#Seção]]` e block reference `[[Título^bloco]]` para parsing/renomeação.
- **Backlink**: nota que contém link explícito apontando para a nota aberta.
- **Menção não vinculada**: ocorrência textual do título de uma nota sem `[[ ]]`, usada como sugestão de conexão.
- **Grafo local**: visualização focada na nota atual, mostrando entradas, saídas e links pendentes diretamente conectados.

## Implementação entregue

### Estado e persistência

- Schema incrementado para `CONFIG.STATE_VERSION = 6`.
- Novo campo persistido em `AppState`: `neuralNotes: NeuralNote[]`.
- Persistência reaproveita o storage existente:
  - desktop: `dashboard-state.json` via Tauri;
  - preview web: `localStorage`.
- Normalização em `src/lib/utils/neural.ts` e integração em `normalizeState()`.

### Store

Arquivo: `src/lib/stores/neural-store.ts`.

Responsabilidades:

- criar, atualizar, excluir e selecionar notas;
- filtrar notas por busca rápida;
- calcular links de saída;
- calcular backlinks linkados;
- detectar menções não vinculadas;
- montar grafo local;
- reescrever wikilinks quando uma nota é renomeada, preservando alias, headings e block references.

### UI

Arquivos:

- `src/lib/components/neural/NeuralPanel.svelte`
- `src/lib/components/neural/NeuralGraph.svelte`
- `src/styles/neural.css`

Fluxo da interface:

- coluna esquerda: busca, estatísticas e lista de notas;
- centro: editor da nota, botão para inserir `[[link]]`, links de saída e grafo local;
- coluna direita: backlinks, menções não vinculadas e sugestões para linkar menções encontradas no texto atual.

### Navegação

- Clique em nota na lista abre a nota.
- Clique em backlink abre a nota de origem.
- Clique em nó do grafo abre a nota correspondente.
- Clique em nó pendente/tracejado cria a nota inexistente referenciada por `[[Título]]`.
- Botão “Linkar” converte a primeira menção textual da nota atual para `[[Título]]`.

### Testes

Arquivo: `src/lib/utils/neural.test.ts`.

Cobertura principal:

- parsing e deduplicação de wikilinks, incluindo alias/subpath;
- normalização de títulos com acentos/case;
- backlinks linkados e não vinculados;
- detecção de menções não vinculadas;
- conversão de menção textual para link;
- reescrita de wikilinks em rename preservando alias/subpath;
- construção do grafo local com links resolvidos e pendentes.

## Arquivos alterados

- `src/lib/config.ts`
- `src/lib/types/app.ts`
- `src/lib/utils/state.ts`
- `src/lib/utils/neural.ts`
- `src/lib/utils/neural.test.ts`
- `src/lib/stores/neural-store.ts`
- `src/lib/stores/ui-store.ts`
- `src/lib/components/TaskHeader.svelte`
- `src/lib/components/TaskPanel.svelte`
- `src/lib/components/neural/NeuralPanel.svelte`
- `src/lib/components/neural/NeuralGraph.svelte`
- `src/styles/index.css`
- `src/styles/tasks.css`
- `src/styles/neural.css`
- `src/lib/i18n/messages.ts`

## Verificação

Comandos executados com sucesso:

```bash
npm run test
npm run typecheck
npm run build
```

Observações do build:

- o build manteve os avisos já existentes de fontes `.woff2` resolvidas em runtime;
- o build indicou um seletor CSS não usado em `FilesPanel.svelte`, existente fora da feature Neural.

## Revisão posterior

A revisão completa da feature está documentada em [`docs/CODE-REVIEW-NEURAL.md`](CODE-REVIEW-NEURAL.md).

## Próximos incrementos recomendados

1. Renderizar preview formatado do texto com links clicáveis, além do modo editor.
2. Adicionar grafo global com filtros por busca, órfãs e profundidade.
3. Persistir seleção da última nota aberta em `ui`.
4. Suportar tags e aliases por metadados/frontmatter.
5. Adicionar import/export Markdown para interoperabilidade com vaults externos.
