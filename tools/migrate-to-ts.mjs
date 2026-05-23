import fs from 'node:fs';
import path from 'node:path';

const root = 'src/lib';
const pairs = [
  ['utils/state.js', 'utils/state.ts'],
  ['utils/tauri.js', 'utils/tauri.ts'],
  ['utils/path.js', 'utils/path.ts'],
  ['utils/focus-trap.js', 'utils/focus-trap.ts'],
  ['services/storage.js', 'services/storage.ts'],
  ['services/exchange.js', 'services/exchange.ts'],
  ['services/opencode.js', 'services/opencode.ts'],
  ['services/timer.js', 'services/timer.ts'],
  ['stores/ui-store.js', 'stores/ui-store.ts'],
  ['stores/app-store.js', 'stores/app-store.ts']
];

for (const [from, to] of pairs) {
  const src = path.join(root, from);
  const dest = path.join(root, to);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    console.log('migrated', from, '->', to);
  }
}

if (fs.existsSync('src/lib/config.js')) {
  fs.unlinkSync('src/lib/config.js');
  console.log('removed config.js');
}

if (fs.existsSync('src/lib/utils/state.test.js')) {
  fs.renameSync('src/lib/utils/state.test.js', 'src/lib/utils/state.test.ts');
}

if (fs.existsSync('src/main.js')) {
  fs.copyFileSync('src/main.js', 'src/main.ts');
  fs.unlinkSync('src/main.js');
}

if (fs.existsSync('src/styles.css')) {
  fs.writeFileSync('src/styles.css', "@import './styles/index.css';\n");
}

console.log('JS to TS migration pass complete');
