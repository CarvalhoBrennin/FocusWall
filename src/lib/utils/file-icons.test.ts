import { describe, expect, it } from 'vitest';
import { resolveFileIcon } from './file-icons.js';

describe('resolveFileIcon', () => {
  it('mapeia pastas especiais', () => {
    expect(resolveFileIcon('node_modules', '', true).kind).toBe('folder-node');
    expect(resolveFileIcon('.git', '', true).kind).toBe('folder-git');
    expect(resolveFileIcon('src', '', true).kind).toBe('folder-src');
  });

  it('mapeia extensões do projeto FocusWall', () => {
    expect(resolveFileIcon('App.svelte', 'svelte', false).kind).toBe('svelte');
    expect(resolveFileIcon('lib.rs', 'rs', false).kind).toBe('rust');
    expect(resolveFileIcon('config.ts', 'ts', false).kind).toBe('typescript');
    expect(resolveFileIcon('styles.css', 'css', false).kind).toBe('css');
  });

  it('mapeia extensões comuns na área Projects', () => {
    expect(resolveFileIcon('App.jsx', 'jsx', false).kind).toBe('react');
    expect(resolveFileIcon('Main.cs', 'cs', false).kind).toBe('csharp');
    expect(resolveFileIcon('logo.png', 'png', false).kind).toBe('image');
    expect(resolveFileIcon('app.dll', 'dll', false).kind).toBe('binary');
  });

  it('reconhece nomes sem extensão', () => {
    expect(resolveFileIcon('Dockerfile', '', false).kind).toBe('docker');
    expect(resolveFileIcon('package.json', 'json', false).kind).toBe('json');
    expect(resolveFileIcon('README.md', 'md', false).kind).toBe('markdown');
  });

  it('usa pasta genérica e arquivo genérico', () => {
    expect(resolveFileIcon('Random', '', true).kind).toBe('folder');
    expect(resolveFileIcon('data.xyz', 'xyz', false).kind).toBe('generic');
  });
});
