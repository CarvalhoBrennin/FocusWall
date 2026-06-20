# Plano — Gerenciamento de arquivos (substituir área de trabalho)

## Objetivo

Transformar a aba **Arquivos** em um substituto prático da Área de Trabalho do Windows: acesso rápido a pastas frequentes, abertura de arquivos no SO e navegação sem sair do dashboard.

## Estado atual (v1)

- Aba **Arquivos** com navegação na Área de Trabalho e atalhos a pastas conhecidas
- Comandos Tauri: `get_desktop_path`, `get_well_known_folders`, `read_directory`, `open_file`
- Breadcrumb, voltar, abrir no Explorer
- Categorias visuais por tipo de arquivo
- Persistência de `filesLastPath` no estado local

## v2 — Atalhos e favoritos

| Item | Descrição |
|------|-----------|
| Pastas fixas | Desktop, Documentos, Downloads, Projetos |
| Favoritos | Pin de pastas em `ui.fileFavorites` (state v5+) |
| Histórico recente | Últimas 10 pastas visitadas |
| Busca por nome | Filtro client-side na lista atual |

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

```json
{
  "ui": {
    "filesLastPath": "C:\\Users\\...\\Desktop",
    "fileFavorites": ["C:\\Projects\\FocusWall"]
  }
}
```

## Ordem de implementação sugerida

1. Favoritos + pastas fixas na toolbar
2. Persistir último path
3. Busca/filtro local
4. CRUD via comandos Rust com ACL granular
5. Integração tarefas/calendário/OpenCode
