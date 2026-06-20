# Mídia — Aba Now Playing

## Objetivo

Aba **Mídia** no painel principal com faixa em reprodução, capa, progresso e controles — integrada ao **System Media Transport Controls (SMTC)** do Windows.

## Implementação

### Backend (Rust)

- Módulo [`src-tauri/src/media/`](../src-tauri/src/media/)
- Comandos: `get_media_snapshot`, `get_media_artwork`, `media_toggle_playback`, `media_skip_next`, `media_skip_previous`
- Evento Tauri: `media://changed` (ponte SMTC → frontend)
- Capas HD: resolução no Rust via SMTC, cache em disco (`AppData/covers/`) e fallback YouTube/Spotify para players em browser
- Permissões: [`src-tauri/permissions/app-commands.toml`](../src-tauri/permissions/app-commands.toml)

### Frontend

- Serviço: [`src/lib/services/media-session.ts`](../src/lib/services/media-session.ts)
- UI: [`src/lib/components/media/`](../src/lib/components/media/)
- Tab: `panelTab === 'media'` em [`ui-store.ts`](../src/lib/stores/ui-store.ts)

## Plataforma

| Ambiente | Comportamento |
|----------|----------------|
| Windows desktop (Tauri) | SMTC completo + capas |
| Preview web | Estado vazio / indisponível |

## CSP

Capas são servidas ao frontend como `data:` URLs (base64). Downloads HTTP (YouTube, Spotify oEmbed) ocorrem **no backend Rust** — não exigem domínios extras no CSP do WebView.

## Testes

- `src/lib/services/media-session.test.ts`
- `src/lib/utils/cover-art.test.ts`, `album-palette.test.ts`
