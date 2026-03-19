# Focus Dashboard

App desktop em Tauri + Svelte para acompanhar tarefas do dia, relógio e câmbio.

## Stack

- Svelte 5
- Vite
- Tauri 2
- Rust

## Rodar

```bash
npm install
npm run dev
```

```bash
npm run tauri:dev
```

## Build

```bash
npm run build
npm run tauri:build
```

## Dados

- Preview web: `localStorage`
- App desktop: `dashboard-state.json` no AppData

## Fonte externa

- AwesomeAPI: `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`
