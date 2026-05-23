# Updater signing

To enable signed auto-updates:

1. Generate keys: `npm run tauri signer generate -- -w ~/.tauri/focuswall.key`
2. Add the public key to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`
3. Set release endpoint in `plugins.updater.endpoints`
4. Build with `TAURI_SIGNING_PRIVATE_KEY` configured in CI

Until keys are configured, the in-app "Check for updates" action fails gracefully.
