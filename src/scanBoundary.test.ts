import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The Anthropic SDK and the scan function's server code stay on the server.
 * The browser bundle is built from src/, so nothing in src/ may import either:
 * the SDK would ship to every phone (and with it the temptation to call the
 * API from the browser with a key), and netlify/lib reads the environment.
 * The shared checks go the other way — netlify/lib imports src/courses/scanGate.
 */
const root = resolve(__dirname);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the scan boundary', () => {
  it('can see an import when there is one', () => {
    const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    expect([...`import Anthropic from '@anthropic-ai/sdk';`.matchAll(re)][0][1]).toBe('@anthropic-ai/sdk');
  });

  it('keeps the Anthropic SDK and netlify/lib out of src/', () => {
    const offenders = files(root).filter((f) => {
      const text = readFileSync(f, 'utf8');
      // Import specifiers only — comments may point at the server code.
      const specifiers = [...text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
      return specifiers.some((s) => s.includes('@anthropic-ai') || s.includes('netlify/lib') || s.includes('/netlify/'));
    });
    expect(offenders).toEqual([]);
  });
});
