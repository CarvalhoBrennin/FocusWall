# Focus Dashboard

Dashboard desktop pessoal em Tauri + Svelte pensado para funcionar como painel de produtividade ou wallpaper informativo em um monitor secundario.

## O que o app faz

- Mostra relogio em tempo real com data longa em pt-BR.
- Exibe USD-BRL e EUR-BRL com cache local e leitura da AwesomeAPI.
- Mantem tarefas por dia, com historico recente, prioridade, reordenacao e conclusao.
- Roda como app desktop sem bordas, sempre no fundo, com controle por tray.
- Salva estado local em JSON no AppData no modo Tauri.

## Stack

- Frontend: Svelte 5 + Vite
- Desktop: Tauri 2 + Rust
- Persistencia: JSON local
- Fallback web: `localStorage` quando rodando so no navegador

## Estrutura

```text
wallpaper/
|-- src/
|   |-- App.svelte
|   |-- styles.css
|   `-- lib/
|       |-- components/
|       |-- config.js
|       |-- services/
|       |-- stores/
|       `-- utils/
|-- src-tauri/
|   |-- src/
|   |-- capabilities/
|   |-- icons/
|   |-- Cargo.toml
|   `-- tauri.conf.json
|-- abrir-dashboard.bat
|-- index.html
`-- package.json
```

## Como rodar

### Frontend no navegador

```bash
npm install
npm run dev
```

Nesse modo o app usa `localStorage` para preview.

### App desktop com Tauri

```bash
npm install
npm run tauri:dev
```

### Build de producao

```bash
npm run build
npm run tauri:build
```

O build desktop sai em `src-tauri/target/release/`.

## Persistencia

- Navegador: chave `focus-dashboard-browser-preview` no `localStorage`
- Tauri: `dashboard-state.json` em AppData

O estado salvo inclui:

- tarefas por data
- cache de cambio
- baseline diario de cambio
- estado de navegacao da interface

## Comportamento desktop

- Janela sem decoracoes
- Sempre no fundo (`alwaysOnBottom`)
- Respeita a area util do monitor, sem engolir a taskbar
- Abre por tray e pode ser ocultada sem encerrar o processo
- Suporte a iniciar com o Windows

## Integracao externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`

## Atalhos e fluxo

- `Alt + Left` e `Alt + Right` navegam pelo historico
- `Ctrl + Enter` ou `Cmd + Enter` foca o campo de nova tarefa
- `Enter` registra a tarefa quando o campo esta ativo

## Observacoes para o repositorio

- `dist/`, `src-tauri/target/`, `data/` e `exports/` ficam fora do versionamento
- `abrir-dashboard.bat` serve como launcher local do executavel em release
