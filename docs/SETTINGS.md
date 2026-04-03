# Central de Configurações do FocusWall

A central de configurações foi estruturada para o uso desktop always-on, com persistência local no mesmo arquivo de estado (`dashboard-state.json` no app Tauri, `localStorage` no preview web).

## Seções disponíveis

## 1) Display / monitor
- Seleção de monitor alvo para abrir o painel.
- Persistência do monitor preferido.
- Reação imediata: ao selecionar, a janela é movida e redimensionada para o monitor escolhido.

## 2) Inicialização com Windows
- Liga/desliga autostart no sistema.
- Mostra feedback de sucesso/erro logo após a ação.

## 3) Comportamento da janela
- Camada da janela:
  - Sempre em segundo plano
  - Camada normal
  - Sempre no topo
- Fechar para bandeja (em vez de encerrar app).

## 4) Aparência / tema
- Seguir sistema
- Escuro
- Claro

## 5) Densidade visual
- Confortável
- Compacta

## 6) Idioma / locale
- `pt-BR`
- `en-US`
- Impacta formatação de data, números e percentuais.

## 7) Comportamento do painel
- Ocultar painel ao perder foco.
- Mostrar segundos no relógio.

## Acessibilidade aplicada
- Foco inicial no botão de fechar.
- Fechamento por `Escape`.
- Trap de foco via `Tab`/`Shift+Tab` dentro da central.
- Navegação completa por teclado nos controles nativos.
- Semântica de diálogo com `role="dialog"` e `aria-modal="true"`.

## Estados de feedback
- Loading com texto de ação em andamento.
- Sucesso com confirmação curta.
- Erro com mensagem quando falha de persistência/API.

## Extensibilidade
A estrutura foi organizada em seções independentes com mapeamento por `id` + controles desacoplados, permitindo incluir novas opções sem alterar o fluxo geral de navegação da central.
