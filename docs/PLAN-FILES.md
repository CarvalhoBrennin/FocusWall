# Plano — Gerenciamento de arquivos (substituir área de trabalho)

## Objetivo

Transformar a aba **Arquivos** em um substituto prático da Área de Trabalho do Windows: acesso rápido a pastas frequentes, abertura de arquivos no SO e navegação sem sair do dashboard.

## Estado atual (v1 + parte do v2)

- Aba **Arquivos** com navegação na Área de Trabalho e atalhos a pastas conhecidas
- Comandos Tauri usados pelo frontend: `get_well_known_folders`, `read_directory`, `open_file`, `pick_project_directory` (via `pickFolder`)
- Comando legado (sem uso no frontend): `get_desktop_path` — a UI usa `get_well_known_folders` com id `desktop`
- Breadcrumb, voltar, abrir no Explorer
- Categorias visuais por tipo de arquivo
- Persistência de `filesLastPath` em `dashboard-state.json` (`ui.filesLastPath`)
- **Favoritos** e **histórico recente** em `localStorage` (`focuswall-files-favorites`, `focuswall-files-recents`) — ver [`src/lib/services/files.ts`](../src/lib/services/files.ts)
- **Busca por nome** — filtro client-side na lista atual (`filterEntries`)

## v2 — Atalhos e favoritos (pendente)

| Item | Descrição | Status |
|------|-----------|--------|
| Pastas fixas | Desktop, Documentos, Downloads, Projetos | ✅ via `get_well_known_folders` |
| Favoritos | Pin de pastas | ✅ `localStorage` (não em `ui.fileFavorites`) |
| Histórico recente | Últimas 10 pastas visitadas | ✅ `localStorage` |
| Busca por nome | Filtro client-side na lista atual | ✅ |
| Migrar favoritos/recents | Para `dashboard-state.json` | ❌ pendente |

## v3 — Operações básicas

| Comando Rust | Ação |
|--------------|------|
| `create_folder` | Nova pasta no diretório atual |
| `rename_path` | Renomear arquivo/pasta |
| `delete_path` | Mover para lixeira (Windows) |
| `copy_path` | Copiar para clipboard ou destino |

Requer confirmação modal no frontend e permissões ACL explícitas por operação.

## v4 — Integração com produtividade

- Arrastar arquivo para tarefa → anexar path na nota da tarefa
- Evento de calendário com link para pasta do projeto
- OpenCode: botão "Abrir pasta do projeto" na aba Arquivos

## UX brutalista

- Cards retos, sem gradientes radiais
- Lista densa com ícones por extensão
- Toolbar fixa: breadcrumb + ações

## Persistência

Estado Tauri (`dashboard-state.json`):

```json
{
  "ui": {
    "filesLastPath": "C:\\Users\\...\\Desktop"
  }
}
```

Favoritos e recentes (preview web e desktop, `localStorage`):

```json
// focuswall-files-favorites / focuswall-files-recents
["C:\\Projects\\FocusWall"]
```

## Ordem de implementação sugerida

1. Favoritos + pastas fixas na toolbar
2. Persistir último path
3. Busca/filtro local
4. CRUD via comandos Rust com ACL granular
5. Integração tarefas/calendário/OpenCode
