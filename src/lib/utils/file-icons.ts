/** Ícone + cor por pasta / extensão (estilo VS Code / Material Icon Theme). */

export type FileIconKind =
  | 'folder'
  | 'folder-git'
  | 'folder-node'
  | 'folder-src'
  | 'folder-dist'
  | 'folder-docs'
  | 'folder-test'
  | 'folder-assets'
  | 'folder-config'
  | 'folder-images'
  | 'folder-projects'
  | 'javascript'
  | 'typescript'
  | 'react'
  | 'svelte'
  | 'rust'
  | 'python'
  | 'ruby'
  | 'csharp'
  | 'go'
  | 'java'
  | 'html'
  | 'css'
  | 'vue'
  | 'json'
  | 'markdown'
  | 'config'
  | 'xml'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'archive'
  | 'shell'
  | 'database'
  | 'binary'
  | 'docker'
  | 'git'
  | 'text'
  | 'generic';

export interface FileIconDescriptor {
  kind: FileIconKind;
  /** Cor principal do ícone (hex). */
  color: string;
  /** Texto curto para leitores de tela. */
  label: string;
}

const FOLDER_BY_NAME: Record<string, FileIconKind> = {
  'node_modules': 'folder-node',
  '.git': 'folder-git',
  '.github': 'folder-git',
  'src': 'folder-src',
  'lib': 'folder-src',
  'app': 'folder-src',
  'dist': 'folder-dist',
  'build': 'folder-dist',
  'out': 'folder-dist',
  'target': 'folder-dist',
  'docs': 'folder-docs',
  'doc': 'folder-docs',
  'documentation': 'folder-docs',
  'test': 'folder-test',
  'tests': 'folder-test',
  '__tests__': 'folder-test',
  'public': 'folder-assets',
  'static': 'folder-assets',
  'assets': 'folder-assets',
  'components': 'folder-src',
  'images': 'folder-images',
  'img': 'folder-images',
  'media': 'folder-images',
  'projects': 'folder-projects',
  '.vscode': 'folder-config',
  '.cursor': 'folder-config',
  '.idea': 'folder-config',
  'tools': 'folder-config',
  'scripts': 'folder-config',
};

const EXT_BY_KIND: Record<string, FileIconKind> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'react',
  tsx: 'react',
  svelte: 'svelte',
  rs: 'rust',
  py: 'python',
  pyw: 'python',
  ipynb: 'python',
  cs: 'csharp',
  csproj: 'csharp',
  sln: 'csharp',
  go: 'go',
  java: 'java',
  kt: 'java',
  kts: 'java',
  scala: 'java',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  vue: 'vue',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  yml: 'config',
  yaml: 'config',
  toml: 'config',
  ini: 'config',
  env: 'config',
  properties: 'config',
  editorconfig: 'config',
  xml: 'xml',
  xaml: 'xml',
  xsd: 'xml',
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  ico: 'image',
  avif: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  avi: 'video',
  wmv: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  aac: 'audio',
  pdf: 'pdf',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'shell',
  psm1: 'shell',
  bat: 'shell',
  cmd: 'shell',
  sql: 'database',
  sqlite: 'database',
  db: 'database',
  exe: 'binary',
  msi: 'binary',
  dll: 'binary',
  so: 'binary',
  dylib: 'binary',
  pdb: 'binary',
  wasm: 'binary',
  winmd: 'binary',
  lock: 'config',
  log: 'text',
  txt: 'text',
  csv: 'text',
  rtf: 'text',
  php: 'html',
  rb: 'ruby',
  swift: 'java',
  lua: 'text',
  zig: 'rust',
  r: 'text',
  dart: 'java',
  dockerfile: 'docker',
};

/** Extensões mapeadas para kind `text` via fallback explícito. */
const EXT_TEXT = new Set(['lua', 'r', 'zig']);

const KIND_META: Record<FileIconKind, { color: string; label: string }> = {
  folder: { color: '#c5c0b8', label: 'Pasta' },
  'folder-git': { color: '#f05032', label: 'Repositório Git' },
  'folder-node': { color: '#8bc34a', label: 'node_modules' },
  'folder-src': { color: '#42a5f5', label: 'Código-fonte' },
  'folder-dist': { color: '#ff9800', label: 'Build / saída' },
  'folder-docs': { color: '#66bb6a', label: 'Documentação' },
  'folder-test': { color: '#ab47bc', label: 'Testes' },
  'folder-assets': { color: '#26a69a', label: 'Recursos estáticos' },
  'folder-config': { color: '#78909c', label: 'Configuração' },
  'folder-images': { color: '#ec407a', label: 'Imagens' },
  'folder-projects': { color: '#7e57c2', label: 'Projetos' },
  javascript: { color: '#f7df1e', label: 'JavaScript' },
  typescript: { color: '#3178c6', label: 'TypeScript' },
  react: { color: '#61dafb', label: 'React' },
  svelte: { color: '#ff3e00', label: 'Svelte' },
  rust: { color: '#dea584', label: 'Rust' },
  python: { color: '#3776ab', label: 'Python' },
  ruby: { color: '#cc342d', label: 'Ruby' },
  csharp: { color: '#68217a', label: 'C#' },
  go: { color: '#00add8', label: 'Go' },
  java: { color: '#b07219', label: 'Java / JVM' },
  html: { color: '#e34c26', label: 'HTML / markup' },
  css: { color: '#563d7c', label: 'CSS' },
  vue: { color: '#42b883', label: 'Vue' },
  json: { color: '#cbcb41', label: 'JSON' },
  markdown: { color: '#519aba', label: 'Markdown' },
  config: { color: '#9cdcfe', label: 'Configuração' },
  xml: { color: '#e37933', label: 'XML' },
  image: { color: '#b39ddb', label: 'Imagem' },
  video: { color: '#ef5350', label: 'Vídeo' },
  audio: { color: '#ff7043', label: 'Áudio' },
  pdf: { color: '#e53935', label: 'PDF' },
  archive: { color: '#a1887f', label: 'Arquivo compactado' },
  shell: { color: '#4caf50', label: 'Script shell' },
  database: { color: '#29b6f6', label: 'Banco de dados' },
  binary: { color: '#90a4ae', label: 'Binário' },
  docker: { color: '#2496ed', label: 'Docker' },
  git: { color: '#f05032', label: 'Git' },
  text: { color: '#b0bec5', label: 'Texto' },
  generic: { color: '#9e9e9e', label: 'Arquivo' },
};

/** Nomes de arquivo sem extensão ou com regra especial. */
const FILE_BY_BASENAME: Record<string, FileIconKind> = {
  dockerfile: 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  makefile: 'shell',
  'cmakelists.txt': 'config',
  'cargo.toml': 'rust',
  'cargo.lock': 'rust',
  'package.json': 'json',
  'package-lock.json': 'json',
  'tsconfig.json': 'typescript',
  'jsconfig.json': 'javascript',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.npmrc': 'config',
  '.nvmrc': 'config',
  '.prettierrc': 'config',
  '.eslintrc': 'config',
  'readme': 'markdown',
  license: 'text',
  licence: 'text',
};

function normalizeExt(extension: string): string {
  return extension.replace(/^\./, '').trim().toLowerCase();
}

function basenameLower(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolve ícone e cor para uma entrada do explorador.
 */
export function resolveFileIcon(
  name: string,
  extension: string,
  isDir: boolean
): FileIconDescriptor {
  const base = basenameLower(name);
  const ext = normalizeExt(extension);

  let kind: FileIconKind;

  if (isDir) {
    kind = FOLDER_BY_NAME[base] ?? 'folder';
  } else if (FILE_BY_BASENAME[base]) {
    kind = FILE_BY_BASENAME[base];
  } else if (base.startsWith('readme')) {
    kind = ext === 'md' || ext === 'mdx' || !ext ? 'markdown' : EXT_BY_KIND[ext] ?? 'markdown';
  } else if (ext && EXT_BY_KIND[ext]) {
    kind = EXT_BY_KIND[ext];
  } else if (ext && EXT_TEXT.has(ext)) {
    kind = 'text';
  } else if (!ext && base.includes('.')) {
    kind = 'generic';
  } else if (!ext) {
    kind = FILE_BY_BASENAME[base] ?? 'generic';
  } else {
    kind = 'generic';
  }

  const meta = KIND_META[kind];
  return { kind, color: meta.color, label: meta.label };
}

/** Badge de 1–3 letras no ícone de arquivo (opcional). */
export function fileIconBadge(kind: FileIconKind): string | null {
  const badges: Partial<Record<FileIconKind, string>> = {
    javascript: 'JS',
    typescript: 'TS',
    react: 'RX',
    svelte: 'SV',
    rust: 'RS',
    python: 'PY',
    csharp: 'C#',
    go: 'GO',
    java: 'JV',
    html: 'HT',
    css: 'CSS',
    vue: 'VU',
    json: '{ }',
    markdown: 'MD',
    config: '⚙',
    xml: 'XML',
    shell: '>_',
    database: 'DB',
    docker: 'DKR',
    ruby: 'RB',
    git: 'GIT',
    pdf: 'PDF',
    archive: 'ZIP',
    binary: 'BIN',
    image: 'IMG',
    video: 'VID',
    audio: 'AUD',
    text: 'TXT',
  };
  return badges[kind] ?? null;
}
