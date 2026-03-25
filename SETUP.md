# Focus Dashboard — Guia de Setup

Instrucoes completas para preparar o ambiente de desenvolvimento em uma maquina Windows nova.

---

## 1. Setup automatizado (recomendado)

Execute o bootstrapper na raiz do projeto:

```bat
Instalar-Focus-Setup.exe
```

O que ele faz, nesta ordem:

1. Solicita permissao de administrador (UAC)
2. Instala **Node.js LTS** via winget (se ausente)
3. Instala **Rust/Rustup** via winget (se ausente)
4. Instala **Visual Studio Build Tools 2022** com workload C++ via winget (se ausente)
5. Instala **WebView2 Runtime** via winget (se ausente)
6. Atualiza o PATH do processo e configura `rustup default stable`
7. Executa `npm install`
8. Roda `npm run check:setup` para validar o ambiente
9. Compila o projeto com `npm run tauri:build` (pode levar varios minutos na primeira vez)
10. Abre o executavel nativo `src-tauri/target/release/Focus Dashboard.exe`

### Requisitos para o bootstrapper funcionar

- **Windows 10/11** com winget disponivel (App Installer da Microsoft Store)
- **Conexao com a internet**
- **Permissao de administrador**

### Se o .exe nao existe

O bootstrapper precisa ser compilado a partir do codigo Rust em `tools/bootstrapper/`. Isso exige Rust ja instalado:

```bat
build-bootstrapper.bat
```

O arquivo `Instalar-Focus-Setup.exe` sera gerado na raiz do projeto.

---

## 2. Setup manual

Se preferir instalar tudo manualmente:

### 2.1. Node.js

Baixe e instale o Node.js 20+ (LTS): https://nodejs.org/

Verifique:
```bash
node -v
npm -v
```

### 2.2. Rust

Instale via rustup: https://www.rust-lang.org/tools/install

Apos instalar:
```bash
rustup default stable
rustc -V
cargo -V
```

### 2.3. Visual Studio Build Tools

Baixe: https://visualstudio.microsoft.com/visual-cpp-build-tools/

Na instalacao, selecione o workload **"Desktop development with C++"**.

### 2.4. WebView2

Ja vem instalado no Windows 10/11. Se estiver ausente (LTSC/Server):
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### 2.5. Dependencias do projeto

```bash
npm install
```

### 2.6. Validar ambiente

```bash
npm run check:setup
```

Deve mostrar `OK` para todos os itens: Node.js, npm, cargo, rustc, Build Tools, WebView2.

---

## 3. Como rodar o projeto

### Desenvolvimento (app desktop)
```bash
npm run tauri:dev
```

### Apenas frontend no navegador
```bash
npm run dev
```

### Build de producao
```bash
npm run tauri:build
```

O executavel final fica em `src-tauri/target/release/`.

---

## 4. Erros comuns

| Erro | Causa | Solucao |
|------|-------|---------|
| `winget nao encontrado` | Windows sem App Installer | Instale o App Installer pela Microsoft Store |
| `cargo: nao encontrado` | Rust nao instalado ou PATH desatualizado | Instale Rust e reabra o terminal |
| `npm: nao encontrado` | Node nao instalado ou PATH desatualizado | Instale Node.js e reabra o terminal |
| `Build Tools: nao encontrado` | MSVC ausente | Instale VS Build Tools com workload C++ |
| `WebView2: nao encontrado` | Raro em Win10/11; comum em LTSC | Instale manualmente pelo link acima |
| `error: linker 'link.exe' not found` | Build Tools sem componente C++ | Reinstale Build Tools com workload correto |
| `failed to bundle project` | Dependencias Rust incompletas | Rode `cargo clean` em `src-tauri/` e tente novamente |
| Bootstrapper nao acha a raiz | .exe esta fora da arvore do projeto | Mova o .exe para dentro da pasta do projeto |

---

## 5. Checklist de validacao

Depois do setup, confirme que tudo funciona:

- [ ] `node -v` retorna v20+
- [ ] `npm -v` retorna versao valida
- [ ] `rustc -V` retorna versao valida
- [ ] `cargo -V` retorna versao valida
- [ ] `npm run check:setup` mostra OK para todos os itens
- [ ] `npm run tauri:dev` abre o Focus Dashboard

---

## 6. Estrutura do tooling

| Arquivo | Descricao |
|---------|-----------|
| `tools/check-setup.mjs` | Diagnostico do ambiente (Node, Rust, Build Tools, WebView2) |
| `tools/bootstrapper/` | Codigo-fonte Rust do instalador automatizado |
| `build-bootstrapper.bat` | Compila o bootstrapper em `.exe` |
| `install-extensions.bat` | Instala extensoes recomendadas no VS Code/Windsurf (opcional) |
