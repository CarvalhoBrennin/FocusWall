# FocusWall — marca oficial

**Variante adotada no produto:** `1C · FOCUS RETICLE`

O explorador de conceitos completo está em `FocusWall Logo.dc.html` (1A–1D). Apenas **1C** é usada no app.

## Implementação no projeto

| Uso | Caminho |
|-----|---------|
| Wordmark na UI (rail) | `src/lib/components/brand/FocusWallLogo.svelte` |
| Ícone / mark (`F` na retícula) | `src/lib/components/brand/FocusReticleMark.svelte` |
| Estilos | `src/styles/brand.css` |
| SVG estático (favicon, export) | `public/brand/focus-reticle-mark.svg` |
| SVG wordmark | `public/brand/focus-reticle-logo.svg` |
| Ícones Tauri / Windows | `src-tauri/icons/` (gerados a partir do mark) |

## Tipografia da marca

- **FOCUS / WALL:** Orbitron (`--font-display`)
- **UI geral:** Manrope (`--font-ui`)

## Cores

- Tinta principal: `#F1ECEC`
- WALL secundário: `rgba(183, 177, 177, 0.7)`
- Fundo: `#0A0A0A`
- Divisor: `rgba(75, 70, 70, 0.5)`

## Regenerar ícones do app

```bash
npx tauri icon public/brand/focus-reticle-mark.svg -o src-tauri/icons
```
