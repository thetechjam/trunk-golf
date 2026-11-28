import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** index.css is a list of @imports; this is the stylesheet they make, in order. */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = [...read('./index.css').matchAll(/@import '([^']+)'/g)].map((m) => read(m[1])).join('\n');
const rules = (selector: string) =>
  [...css.matchAll(new RegExp(`(?:^|\\}|\\*/)\\s*${selector.replace(/[.*]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (m) => m[1]
  );
/** The last value a selector's own rules give a property, as the cascade would. */
const last = (selector: string, prop: string) =>
  rules(selector)
    .flatMap((body) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))])
    .map((m) => m[1].trim())
    .at(-1);

/**
 * A picked game tile carries its stake on a second line, so it is taller than
 * an unpicked neighbour, and the grid stretches the pair to match. Layout is
 * not measurable in happy-dom, so these pin the declarations that keep the
 * pair level and the stake line short enough to hold "per skin" at 390px.
 */
describe('game tiles with a stake', () => {
  it('top-align the tile contents, so a stretched unpicked tile stays level', () => {
    // .game-card is centred elsewhere; the game-list rule must override it.
    expect(last('.game-card', 'justify-content')).toBe('center');
    expect(last('.game-list .game-card', 'justify-content')).toBe('flex-start');
  });

  it('keep the tile stake field a 44px tap target, 56px wide', () => {
    expect(last('.game-stake input', 'min-height')).toBe('44px');
    expect(last('.game-stake input', 'width')).toBe('56px');
  });

  it('set the unit small enough to share the field’s line', () => {
    expect(last('.game-stake .per', 'font-size')).toBe('var(--fs-sm)');
  });
});
