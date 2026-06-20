# Vivarium (archived)

This feature is **dormant** — UI entry points are disabled via `VIVARIUM_ENABLED` in `src/lib/features.ts`.

Code under `src/lib/components/vivarium/` is kept for later sprite-based work.

## Re-enable

1. Set `VIVARIUM_ENABLED = true` in `src/lib/features.ts`.
2. Uncomment the Vivarium lazy-load `$effect` and panel block in `TaskPanel.svelte`.
3. Add a Vivarium tab entry to `TaskHeader.svelte` if you want it in the tab bar (no tab is registered while archived).

## OpenCode (separate feature)

OpenCode uses `OPENCODE_TAB_ENABLED` in `src/lib/features.ts`. See `docs/AUDIT-FEATURE-OPENCODE.md`.
