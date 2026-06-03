import { describe, expect, it } from 'vitest';
import { buildPathSegments, ensureAbsolutePath, parentDirectory } from './path.js';

describe('ensureAbsolutePath', () => {
  it('converts drive letter without slash', () => {
    expect(ensureAbsolutePath('C:')).toBe('C:\\');
  });

  it('keeps full windows path', () => {
    expect(ensureAbsolutePath('C:\\Users\\dev')).toBe('C:\\Users\\dev');
  });

  it('normalizes forward slashes', () => {
    expect(ensureAbsolutePath('C:/Users/dev')).toBe('C:\\Users\\dev');
  });
});

describe('buildPathSegments', () => {
  it('produces absolute breadcrumb paths', () => {
    const segments = buildPathSegments('C:\\Users\\dev\\Projects');
    expect(segments[0]?.path).toBe('C:\\');
    expect(segments[1]?.path).toBe('C:\\Users');
    expect(segments.at(-1)?.path).toBe('C:\\Users\\dev\\Projects');
  });
});

describe('parentDirectory', () => {
  it('returns drive root from one level below', () => {
    expect(parentDirectory('C:\\Users')).toBe('C:\\');
  });
});
