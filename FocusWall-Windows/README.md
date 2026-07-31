# Artefato Windows não incluído

O executável anteriormente presente nesta pasta foi removido porque foi compilado antes da implementação da aba Radar e não correspondia ao código-fonte deste pacote.

Para gerar um binário coerente com esta versão, instale as dependências e a toolchain Rust/Tauri e execute:

```bash
npm ci
npm run tauri:build:installer
```

Distribua somente os artefatos gerados por esse build e registre o SHA-256 correspondente.
