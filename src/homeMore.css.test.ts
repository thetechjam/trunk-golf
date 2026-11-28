import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** index.css is a list of @imports; this is the stylesheet they make, in order, comments out. */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = [...read('./index.css').matchAll(/@import '([^']+)'/g)]
  .map((m) => read(m[1]))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
/** Bodies of every rule whose selector list contains `selector`. */
const rules = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => s.trim() === selector))
    .map((m) => m[2]);
/** The last value a selector's own rules give a property, as the cascade would. */
const last = (selector: string, prop: string) =>
  rules(selector)
    .flatMap((body) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))])
    .map((m) => m[1].trim())
    .at(-1);

/**
 * Home's "Or start something else" card clips to its rounded corners, so the
 * global 2px-outside focus ring would be cut off on its rows and, mid-round,
 * on the toggle that fills the card. Layout is not measurable in happy-dom;
 * these pin the declarations instead.
 */
describe('Home’s start-something-else card', () => {
  it('clips to its corners (why the ring must sit inside)', () => {
    expect(last('.home-more', 'overflow')).toBe('hidden');
  });

  it('draws the focus ring inside its rows and the mid-round toggle', () => {
    expect(last('.home-more-row:focus-visible', 'outline-offset')).toBe('-2px');
    expect(last('.home-more-toggle:focus-visible', 'outline-offset')).toBe('-2px');
  });

  it('sets the folded toggle label one step above the eyebrow size', () => {
    expect(last('.home-more-title', 'font-size')).toBe('var(--fs-xs)');
    expect(last('.home-more.folded .home-more-toggle', 'font-size')).toBe('var(--fs-sm)');
  });
});
