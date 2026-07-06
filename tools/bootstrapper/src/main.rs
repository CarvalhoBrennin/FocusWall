use std::{
    env, fs, thread,
    path::{Path, PathBuf},
    process::{exit, Command, Stdio},
    time::Duration,
};

use mslnk::ShellLink;

const APP_EXE: &str = "focus-desktop-dashboard.exe";
const APP_NAME: &str = "FocusWall";
const OLLAMA_PACKAGE_ID: &str = "Ollama.Ollama";
const OLLAMA_MODEL: &str = "qwen2.5:1.5b";

fn main() {
    println!("=== {} — Instalador ===\n", APP_NAME);

    if let Err(msg) = run() {
        eprintln!("\nERRO: {msg}");
        pause();
        exit(1);
    }
}

fn run() -> Result<(), String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let installer_dir = exe_path
        .parent()
        .ok_or("Nao foi possivel localizar a pasta do instalador.")?
        .to_path_buf();

    let bin_src = installer_dir.join("release").join(APP_EXE);

    if !bin_src.exists() {
        return Err(format!(
            "Arquivo {} nao encontrado junto ao instalador.\n\
             Esperado: {}\n\n\
             Certifique-se de que a pasta 'release' esta na mesma pasta que este executavel.",
            APP_EXE,
            bin_src.display()
        ));
    }

    println!("Instalador detectado em versao portatil (pre-compilada).");
    println!("Nenhuma dependencia de desenvolvimento (Node.js, Rust, VS) sera instalada.");
    println!();

    let local_app_data =
        env::var("LOCALAPPDATA").map_err(|_| "Variavel LOCALAPPDATA nao encontrada.")?;
    let install_dir = std::path::PathBuf::from(&local_app_data).join("FocusWall");
    let bin_dest = install_dir.join(APP_EXE);

    println!("Pasta de instalacao: {}", install_dir.display());
    println!();

    println!("[1/6] Instalando arquivos...");
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Falha ao criar pasta de instalacao: {e}"))?;

    fs::copy(&bin_src, &bin_dest)
        .map_err(|e| format!("Falha ao copiar executavel: {e}"))?;

    println!("      Pronto.");

    println!();
    println!("[2/6] Verificando WebView2 Runtime...");
    if !is_webview2_installed() {
        println!("      Instalando WebView2 Runtime...");
        install_webview2()?;
    } else {
        println!("      WebView2 ja instalado.");
    }

    println!();
    println!("[3/6] Verificando assistente local (Ollama)...");
    if !is_ollama_installed() {
        println!("      Instalando Ollama, dependencia do assistente local...");
        install_ollama()?;
    } else {
        println!("      Ollama ja instalado.");
    }

    println!();
    println!("[4/6] Verificando modelo do assistente...");
    ensure_ollama_model()?;

    println!();
    println!("[5/6] Criando atalhos...");

    let shortcut_working_dir = &install_dir;
    let shortcut_target = &bin_dest;

    if let Some(desktop) = user_desktop_dir() {
        fs::create_dir_all(&desktop).ok();
        create_shortcut(shortcut_working_dir, shortcut_target, &desktop)?;
    }

    if let Ok(start_menu) = env::var("APPDATA")
        .map(|p| std::path::PathBuf::from(p).join(r"Microsoft\Windows\Start Menu\Programs\FocusWall"))
    {
        fs::create_dir_all(&start_menu).ok();
        create_shortcut(shortcut_working_dir, shortcut_target, &start_menu)?;
    }

    println!("      Atalhos criados na Area de Trabalho e no Menu Iniciar.");

    println!();
    println!("[6/6] Configuracao de autostart...");
    println!("      Deseja que o {} inicie junto com o Windows?", APP_NAME);
    print!("      (S/N): ");
    let mut answer = String::new();
    std::io::stdin().read_line(&mut answer).ok();

    if answer.trim().to_lowercase().starts_with('s') {
        if let Ok(startup) = env::var("APPDATA")
            .map(|p| std::path::PathBuf::from(p).join(r"Microsoft\Windows\Start Menu\Programs\Startup"))
        {
            fs::create_dir_all(&startup).ok();
            create_shortcut(shortcut_working_dir, shortcut_target, &startup)?;
            println!("      Autostart ativado.");
        }
    } else {
        println!("      Autostart ignorado.");
    }

    println!();
    println!("Instalacao concluida com sucesso!");
    println!(
        "O {} pode ser aberto pelo atalho no Menu Iniciar ou na Area de Trabalho.",
        APP_NAME
    );
    println!();

    print!("Deseja abrir o {} agora? (S/N): ", APP_NAME);
    let mut answer = String::new();
    std::io::stdin().read_line(&mut answer).ok();

    if answer.trim().to_lowercase().starts_with('s') {
        Command::new(&bin_dest)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Falha ao iniciar: {e}"))?;
        println!("      {} iniciado.", APP_NAME);
    }

    pause();
    Ok(())
}

fn create_shortcut(
    working_dir: &Path,
    target: &Path,
    link_dir: &Path,
) -> Result<(), String> {
    let link_path = link_dir.join(format!("{}.lnk", APP_NAME));
    let mut link = ShellLink::new(target).map_err(|error| error.to_string())?;
    link.set_working_dir(Some(working_dir.to_string_lossy().into_owned()));
    link.set_icon_location(Some(target.to_string_lossy().into_owned()));
    link.create_lnk(&link_path).map_err(|error| error.to_string())
}

fn user_desktop_dir() -> Option<PathBuf> {
    dirs::desktop_dir()
}

fn is_webview2_installed() -> bool {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            "/v",
            "pv",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.contains("pv") && !text.contains("0.0.0.0")
        }
        _ => false,
    }
}

fn install_webview2() -> Result<(), String> {
    if let Ok(status) = Command::new("winget")
        .args([
            "install",
            "--id",
            "Microsoft.EdgeWebView2Runtime",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--silent",
        ])
        .status()
    {
        if status.success() {
            return Ok(());
        }
    }

    let temp = env::var("TEMP").unwrap_or_else(|_| ".".to_string());
    let installer_path = PathBuf::from(&temp).join("MicrosoftEdgeWebview2Setup.exe");
    let url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    let mut downloaded = false;
    for attempt in 1..=3 {
        println!("      Baixando WebView2 Runtime (tentativa {attempt}/3)...");

        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!(
                    "try {{ Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing }} catch {{ exit 1 }}",
                    url,
                    installer_path.display()
                ),
            ])
            .status();

        if matches!(status, Ok(s) if s.success() && installer_path.exists()) {
            downloaded = true;
            break;
        }
    }

    if !downloaded {
        return Err("Falha ao baixar WebView2 Runtime após 3 tentativas.".into());
    }

    println!("      Instalando WebView2 Runtime...");

    let status = Command::new(&installer_path)
        .arg("/silent")
        .arg("/install")
        .status()
        .map_err(|e| format!("Falha ao executar instalador do WebView2: {e}"))?;

    fs::remove_file(&installer_path).ok();

    if !status.success() {
        return Err("Falha ao instalar WebView2 Runtime.".into());
    }

    Ok(())
}

fn is_ollama_installed() -> bool {
    ollama_command().is_some()
}

fn ollama_command() -> Option<PathBuf> {
    if let Ok(output) = Command::new("where")
        .arg("ollama")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = text.lines().map(str::trim).find(|line| !line.is_empty()) {
                return Some(PathBuf::from(first));
            }
        }
    }

    let mut candidates = Vec::new();
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe"),
        );
    }
    for var_name in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = env::var_os(var_name) {
            candidates.push(PathBuf::from(root).join("Ollama").join("ollama.exe"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn install_ollama() -> Result<(), String> {
    let status = Command::new("winget")
        .args([
            "install",
            "--id",
            OLLAMA_PACKAGE_ID,
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--silent",
        ])
        .status()
        .map_err(|e| format!("Falha ao executar winget para instalar Ollama: {e}"))?;

    if status.success() || is_ollama_installed() {
        return Ok(());
    }

    Err("Falha ao instalar Ollama pelo winget. Instale o Ollama manualmente e execute o FocusWall novamente.".into())
}


fn ensure_ollama_model() -> Result<(), String> {
    let Some(ollama) = ollama_command() else {
        return Err("Ollama instalado, mas o executavel nao foi localizado para baixar o modelo.".into());
    };

    ensure_ollama_service_running(&ollama)?;

    if is_ollama_model_available(&ollama, OLLAMA_MODEL) {
        println!("      Modelo {OLLAMA_MODEL} ja instalado.");
        return Ok(());
    }

    println!("      Baixando modelo {OLLAMA_MODEL}. Esta etapa pode demorar na primeira instalacao...");
    let status = Command::new(&ollama)
        .args(["pull", OLLAMA_MODEL])
        .status()
        .map_err(|e| format!("Falha ao executar ollama pull: {e}"))?;

    if status.success() && is_ollama_model_available(&ollama, OLLAMA_MODEL) {
        println!("      Modelo do assistente instalado.");
        return Ok(());
    }

    Err(format!(
        "Nao foi possivel baixar o modelo {OLLAMA_MODEL}. Execute manualmente: ollama pull {OLLAMA_MODEL}"
    ))
}

fn ensure_ollama_service_running(ollama: &Path) -> Result<(), String> {
    if ollama_list_success(ollama) {
        return Ok(());
    }

    Command::new(ollama)
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Falha ao iniciar servico do Ollama: {e}"))?;

    for _ in 0..40 {
        thread::sleep(Duration::from_millis(500));
        if ollama_list_success(ollama) {
            return Ok(());
        }
    }

    Err("Ollama foi chamado, mas o servico nao respondeu.".into())
}

fn ollama_list_success(ollama: &Path) -> bool {
    Command::new(ollama)
        .arg("list")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn is_ollama_model_available(ollama: &Path, model: &str) -> bool {
    let Ok(output) = Command::new(ollama)
        .arg("list")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().any(|line| line.split_whitespace().next() == Some(model))
}

fn pause() {
    print!("Pressione ENTER para sair...");
    let _ = std::io::stdin().read_line(&mut String::new());
}
