import fs from 'node:fs';

const css = fs.readFileSync('src/styles.css', 'utf8');
const lines = css.split('\n');

const chunks = {
  'tokens.css': [0, 66],
  'base.css': [66, 113],
  'layout.css': [113, 643],
  'tasks.css': [643, 1092],
  'calendar.css': [1092, 1602],
  'files-opencode.css': [1602, 2067],
  'components.css': [2067, 2565],
  'responsive.css': [2565, 2929]
};

fs.mkdirSync('src/styles', { recursive: true });

for (const [file, [start, end]] of Object.entries(chunks)) {
  fs.writeFileSync(`src/styles/${file}`, `${lines.slice(start, end).join('\n').trim()}\n`);
}

const index = `${Object.keys(chunks)
  .map((file) => `@import './${file}';`)
  .join('\n')}\n`;

fs.writeFileSync('src/styles/index.css', index);
console.log('Split CSS into', Object.keys(chunks).length, 'files');
