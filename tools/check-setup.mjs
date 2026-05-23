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

console.log("Verificando ambiente de DESENVOLVIMENTO do Focus Dashboard...\n");
console.log("(Usuario final: use o instalador portatil, nao precisa disto.)\n");

let hasError = false;

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
}

console.log("");

if (hasError) {
  console.log("Ambiente de desenvolvimento incompleto. Corrija os itens acima.");
  process.exit(1);
}

console.log("Ambiente de desenvolvimento pronto!");
console.log("Para buildar: npm install && npm run tauri:build");
