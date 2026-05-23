# Deploy Focus Dashboard

## Para usuarios finais (sem ferramentas de dev)

### Metodo 1: Instalador portatil (recomendado)

1. Extraia o arquivo `.zip` recebido
2. Execute `Instalar-Focus-Setup.exe`
3. O instalador:
   - Copia o aplicativo para `%LOCALAPPDATA%\FocusWall\`
   - Verifica/instala o WebView2 Runtime se necessario
   - Cria atalhos na Area de Trabalho e Menu Iniciar
   - Pergunta se quer iniciar com o Windows
4. Pronto. Nao precisa de Node.js, Rust, nem Visual Studio.

**Unica dependencia do usuario final:** WebView2 Runtime (ja pre-instalado no Windows 10 1809+ e Windows 11).

### Metodo 2: Apenas o executavel

1. Pegue o arquivo `focus-desktop-dashboard.exe`
2. Coloque em qualquer pasta
3. Execute. Nao requer instalacao.

Se o Windows reclamar que precisa do WebView2, instale em:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

---

## Para desenvolvedores (build a partir do codigo fonte)

Requisitos no Windows:
- Node.js 20+ (https://nodejs.org/)
- Rust (https://www.rust-lang.org/tools/install)
- Visual Studio Build Tools com workload "Desktop development with C++"
- WebView2 Runtime

Verifique o ambiente:
```bash
npm run check:setup
```

Build:
```bash
npm install
npm run tauri:build
```

Artefatos gerados:
- `dist/` — build web (frontend)
- `src-tauri/target/release/focus-desktop-dashboard.exe` — executavel desktop
- `src-tauri/target/release/bundle/msi/` — instalador WiX (.msi)

---

## Criar instalador portatil para distribuir

Depois de rodar `npm run tauri:build`, execute:

```bash
build-bootstrapper.bat
```

Isso gera a pasta `FocusWall-Installer\` com:
```
FocusWall-Installer\
├── Instalar-Focus-Setup.exe
└── release\
    └── focus-desktop-dashboard.exe
```

Compacte a pasta em `.zip` e distribua.
