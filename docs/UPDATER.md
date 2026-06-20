# Updater signing

The in-app updater is **disabled by default** (`UPDATER_ENABLED = false` in `src/lib/services/updater.ts`). The Rust plugin is not wired in `Cargo.toml` yet.

To enable signed auto-updates:

1. Add `tauri-plugin-updater` to `src-tauri/Cargo.toml` and register it in `lib.rs`
2. Generate keys: `npm run tauri signer generate -- -w ~/.tauri/focuswall.key`
3. Add the public key to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`
4. Set release endpoint in `plugins.updater.endpoints`
5. Set `UPDATER_ENABLED = true` in `src/lib/services/updater.ts`
6. Build with `TAURI_SIGNING_PRIVATE_KEY` configured in CI

Until the above is configured, the in-app "Check for updates" action fails gracefully.
