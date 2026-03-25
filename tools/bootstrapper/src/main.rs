use std::{
    env,
    path::{Path, PathBuf},
    process::{exit, Command, Stdio},
};

const TOTAL_STEPS: u8 = 9;

fn main() {
    println!("=== Focus Dashboard — Setup Automatizado ===");
    println!();

    if let Err(message) = run() {
        eprintln!("\nERRO: {message}");
        pause();
        exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    let exe_path = env::current_exe().map_err(|error| error.to_string())?;
    let root = find_project_root(&exe_path)?;

    env::set_current_dir(&root).map_err(|error| error.to_string())?;

    let skip_elevation = env::var("FOCUS_SKIP_ELEVATION")
        .map(|value| value == "1")
        .unwrap_or(false)
        || args.iter().any(|arg| arg == "--skip-elevation");

    if !skip_elevation && !is_running_as_admin()? {
        elevate(&exe_path, &root)?;
        return Ok(());
    }

    ensure_command("winget", "winget nao encontrado. Instale o App Installer da Microsoft Store e tente novamente.")?;

    step(1, "Node.js LTS");
    install_node()?;

    step(2, "Rust (rustup)");
    install_rust()?;

    step(3, "Visual Studio Build Tools");
    install_build_tools()?;

    step(4, "WebView2 Runtime");
    install_webview2()?;

    step(5, "Atualizando PATH");
    refresh_path(&root);
    configure_rust_toolchain()?;
    println!("       PATH atualizado para o processo atual.");

    step(6, "Dependencias do projeto (npm install)");
    install_project_dependencies(&root)?;

    step(7, "Validacao do ambiente");
    run_setup_check(&root)?;

    step(8, "Build do projeto (pode levar varios minutos na primeira vez)");
    build_project(&root)?;

    step(9, "Iniciando Focus Dashboard");
    launch_dashboard(&root)?;

    println!();
    println!("Setup concluido com sucesso!");
    println!("O Focus Dashboard foi iniciado.");
    pause();
    Ok(())
}

fn step(n: u8, label: &str) {
    println!();
    println!("[{n}/{TOTAL_STEPS}] {label}");
}

fn is_running_as_admin() -> Result<bool, String> {
    let status = Command::new("cmd")
        .args(["/C", "net", "session"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| error.to_string())?;

    Ok(status.success())
}

fn elevate(exe_path: &Path, root: &Path) -> Result<(), String> {
    println!("Solicitando permissao de administrador...");

    let exe = quote_ps(exe_path);
    let cwd = quote_ps(root);
    let command = format!("Start-Process -FilePath {exe} -WorkingDirectory {cwd} -Verb RunAs");

    let status = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &command])
        .status()
        .map_err(|error| error.to_string())?;

    if !status.success() {
        return Err("Nao foi possivel solicitar permissao de administrador.".to_string());
    }

    Ok(())
}

fn install_node() -> Result<(), String> {
    if let Some(version) = command_output("node", &["-v"]) {
        println!("       Ja instalado: {version}");
        return Ok(());
    }

    println!("       Instalando via winget...");
    run_checked(
        "winget",
        &[
            "install",
            "--id",
            "OpenJS.NodeJS.LTS",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
        ],
        "Falha ao instalar Node.js.",
    )
}

fn install_rust() -> Result<(), String> {
    if let Some(version) = cargo_version() {
        println!("       Ja instalado: {version}");
        return Ok(());
    }

    println!("       Instalando via winget...");
    run_checked(
        "winget",
        &[
            "install",
            "--id",
            "Rustlang.Rustup",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
        ],
        "Falha ao instalar Rust.",
    )
}

fn install_build_tools() -> Result<(), String> {
    if let Some(name) = find_build_tools() {
        println!("       Ja instalado: {name}");
        return Ok(());
    }

    println!("       Instalando via winget (pode demorar alguns minutos)...");
    run_checked(
        "winget",
        &[
            "install",
            "--id",
            "Microsoft.VisualStudio.2022.BuildTools",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--override",
            "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --norestart",
        ],
        "Falha ao instalar Visual Studio Build Tools.",
    )
}

fn install_webview2() -> Result<(), String> {
    if is_webview2_installed() {
        println!("       Ja instalado.");
        return Ok(());
    }

    println!("       Instalando via winget...");
    run_checked(
        "winget",
        &[
            "install",
            "--id",
            "Microsoft.EdgeWebView2Runtime",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
        ],
        "Falha ao instalar WebView2. Instale manualmente: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
    )
}

fn is_webview2_installed() -> bool {
    // WebView2 registra sua versao nesta chave do registry
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
            // Se a chave existe e tem valor, WebView2 esta instalado
            text.contains("pv") && !text.contains("0.0.0.0")
        }
        _ => false,
    }
}

fn configure_rust_toolchain() -> Result<(), String> {
    let rustup = cargo_bin("rustup.exe").or_else(|| which("rustup"));
    if let Some(rustup) = rustup {
        println!("       Configurando toolchain stable...");
        run_checked_path(
            &rustup,
            &["default", "stable"],
            "Falha ao configurar o Rust stable.",
        )?;
    }

    Ok(())
}

fn install_project_dependencies(root: &Path) -> Result<(), String> {
    let npm = npm_path()?;
    run_checked_path_in(&npm, root, &["install"], "Falha ao executar npm install.")
}

fn run_setup_check(root: &Path) -> Result<(), String> {
    let npm = npm_path()?;
    run_checked_path_in(&npm, root, &["run", "check:setup"], "A validacao do ambiente falhou.")
}

fn build_project(root: &Path) -> Result<(), String> {
    let npm = npm_path()?;
    println!("       Executando: npm run tauri:build");
    println!("       Isso pode levar de 3 a 10 minutos na primeira compilacao...");
    run_checked_path_in(&npm, root, &["run", "tauri:build"], "Falha ao compilar o projeto. Verifique se todas as dependencias estao instaladas.")
}

fn launch_dashboard(root: &Path) -> Result<(), String> {
    // O nome do executavel vem do campo name em src-tauri/Cargo.toml
    let exe = root
        .join("src-tauri")
        .join("target")
        .join("release")
        .join("focus-desktop-dashboard.exe");

    if !exe.exists() {
        return Err(format!(
            "Executavel nao encontrado em {}. O build pode ter falhado.",
            exe.display()
        ));
    }

    println!("       Abrindo: {}", exe.display());

    // Inicia o app como processo independente sem console
    Command::new(&exe)
        .current_dir(root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Falha ao iniciar o dashboard: {error}"))?;

    Ok(())
}

fn refresh_path(root: &Path) {
    let current = env::var("PATH").unwrap_or_default();
    let node = env::var("ProgramFiles")
        .map(|dir| PathBuf::from(dir).join("nodejs"))
        .ok();
    let cargo = env::var("USERPROFILE")
        .map(|dir| PathBuf::from(dir).join(".cargo").join("bin"))
        .ok();
    let npm_bin = root.join("node_modules").join(".bin");

    let mut parts = vec![npm_bin];
    if let Some(node) = node {
        parts.push(node);
    }
    if let Some(cargo) = cargo {
        parts.push(cargo);
    }

    let mut merged = String::new();
    for part in parts {
        if !merged.is_empty() {
            merged.push(';');
        }
        merged.push_str(&part.to_string_lossy());
    }
    if !current.is_empty() {
        if !merged.is_empty() {
            merged.push(';');
        }
        merged.push_str(&current);
    }

    env::set_var("PATH", merged);
}

fn find_project_root(exe_path: &Path) -> Result<PathBuf, String> {
    let mut current = exe_path
        .parent()
        .ok_or_else(|| "Nao foi possivel localizar a pasta do bootstrapper.".to_string())?
        .to_path_buf();

    loop {
        let has_package = current.join("package.json").exists();
        let has_tauri = current.join("src-tauri").join("tauri.conf.json").exists();
        if has_package && has_tauri {
            println!("Raiz do projeto: {}", current.display());
            return Ok(current);
        }

        if !current.pop() {
            break;
        }
    }

    Err("Nao foi possivel localizar a raiz do projeto. Certifique-se de que o executavel esta dentro da pasta do projeto.".to_string())
}

fn cargo_version() -> Option<String> {
    cargo_bin("cargo.exe")
        .and_then(|path| command_output_path(&path, &["-V"]))
        .or_else(|| command_output("cargo", &["-V"]))
}

fn npm_path() -> Result<PathBuf, String> {
    which("npm.cmd")
        .or_else(|| which("npm"))
        .or_else(|| {
            env::var("ProgramFiles")
                .ok()
                .map(|dir| PathBuf::from(dir).join("nodejs").join("npm.cmd"))
                .filter(|path| path.exists())
        })
        .ok_or_else(|| "npm nao encontrado no PATH apos a instalacao do Node.js.".to_string())
}

fn cargo_bin(exe_name: &str) -> Option<PathBuf> {
    env::var("USERPROFILE")
        .ok()
        .map(|dir| PathBuf::from(dir).join(".cargo").join("bin").join(exe_name))
        .filter(|path| path.exists())
}

fn find_build_tools() -> Option<String> {
    let program_files_x86 = env::var("ProgramFiles(x86)").ok()?;
    let vswhere = PathBuf::from(program_files_x86)
        .join("Microsoft Visual Studio")
        .join("Installer")
        .join("vswhere.exe");

    if !vswhere.exists() {
        return None;
    }

    command_output_path(
        &vswhere,
        &[
            "-latest",
            "-products",
            "*",
            "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property",
            "displayName",
        ],
    )
}

fn run_checked(program: &str, args: &[&str], error_message: &str) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|error| format!("{error_message} {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(error_message.to_string())
    }
}

fn run_checked_path(program: &Path, args: &[&str], error_message: &str) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|error| format!("{error_message} {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(error_message.to_string())
    }
}

fn run_checked_path_in(program: &Path, root: &Path, args: &[&str], error_message: &str) -> Result<(), String> {
    let status = Command::new(program)
        .current_dir(root)
        .args(args)
        .status()
        .map_err(|error| format!("{error_message} {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(error_message.to_string())
    }
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn command_output_path(program: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn ensure_command(program: &str, message: &str) -> Result<(), String> {
    if which(program).is_some() {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

fn which(program: &str) -> Option<PathBuf> {
    let output = Command::new("where").arg(program).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let first = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|line| line.trim().to_string())?;

    if first.is_empty() {
        None
    } else {
        Some(PathBuf::from(first))
    }
}

fn quote_ps(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\'', "''");
    format!("'{value}'")
}

fn pause() {
    let _ = Command::new("cmd").args(["/C", "pause"]).status();
}
