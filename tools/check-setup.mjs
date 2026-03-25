import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  {
    name: "Node.js",
    command: "node",
    args: ["-v"],
    install: "Instale o Node.js 20+ em https://nodejs.org/",
  },
  {
    name: "npm",
    command: "npm",
    args: ["-v"],
    install: "O npm vem junto com o Node.js.",
  },
  {
    name: "cargo",
    command: "cargo",
    args: ["-V"],
    install: "Instale o Rust com rustup: https://www.rust-lang.org/tools/install",
  },
  {
    name: "rustc",
    command: "rustc",
    args: ["-V"],
    install: "O compilador Rust e instalado junto com o rustup.",
  },
];

let hasError = false;

console.log("Verificando prerequisitos do Focus Dashboard...\n");

for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    shell: process.platform === "win32",
    encoding: "utf8",
  });

  if (result.status === 0) {
    const output = `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0];
    console.log(`OK  ${check.name}: ${output}`);
    continue;
  }

  hasError = true;
  console.log(`ERRO ${check.name}: nao encontrado.`);
  console.log(`     ${check.install}`);
}

console.log("");

if (process.platform === "win32") {
  const vswherePath = `${process.env["ProgramFiles(x86)"]}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
  const buildTools = spawnSync(
    vswherePath,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "displayName",
    ],
    { encoding: "utf8" },
  );

  const buildToolsName = `${buildTools.stdout || ""}`.trim();

  if (buildTools.status === 0 && buildToolsName) {
    console.log(`OK  Microsoft C++ Build Tools: ${buildToolsName}`);
  } else {
    hasError = true;
    console.log("ERRO Microsoft C++ Build Tools: nao encontrado.");
    console.log(
      "     Instale o Visual Studio Build Tools com o workload 'Desktop development with C++'.",
    );
  }

  const webview2 = spawnSync(
    "reg",
    [
      "query",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
      "/v",
      "pv",
    ],
    { encoding: "utf8" },
  );

  const webview2Output = `${webview2.stdout || ""}`.trim();

  if (webview2.status === 0 && webview2Output && !webview2Output.includes("0.0.0.0")) {
    const match = webview2Output.match(/pv\s+REG_SZ\s+(.+)/);
    const version = match ? match[1].trim() : "detectado";
    console.log(`OK  WebView2 Runtime: ${version}`);
  } else {
    hasError = true;
    console.log("ERRO WebView2 Runtime: nao encontrado.");
    console.log(
      "     Instale em https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
    );
  }

  console.log("");
}

if (hasError) {
  console.log("Ambiente incompleto. Corrija os itens acima e rode novamente.");
  process.exit(1);
}

console.log("Ambiente pronto. Proximo passo:");
console.log("1. npm install");
console.log("2. npm run tauri:dev");
