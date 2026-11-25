import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAMES } from './games';

/**
 * The landing page at trunk.golf/welcome/ (public/welcome/index.html). It is
 * a static file beside the app, so nothing else in the suite looks at it, and
 * the site CSP (netlify.toml) decides what it may contain: script-src 'self'
 * blocks any inline script, img-src and font-src are 'self', so every image
 * and the font have to come from this origin.
 *
 * The images are cut from the README screenshots and the take-A mark with
 * ImageMagick 7. From the repository root:
 *
 *   for n in hole board setup; do
 *     magick docs/screenshots/$n.png -resize 520x -quality 84 public/welcome/$n.webp
 *   done
 *   magick docs/screenshots/scoreboard.png -resize 640x -quality 86 public/welcome/scoreboard.webp
 *   magick docs/brand/source/mark-3d-full.png -resize 420x -quality 90 public/welcome/mark.webp
 *
 * The four screenshots come out byte-identical to the committed files with
 * ImageMagick 7.1.2; the mark comes out the same size and visually identical
 * (PSNR 77 dB) but not byte-identical, so its exact encoder settings differ
 * slightly. Re-run these when the screenshots or the mark change; the sizes
 * below and the width/height on each <img> have to match what they produce.
 */

const root = resolve(__dirname, '..');
const pub = resolve(root, 'public');
const pagePath = resolve(pub, 'welcome', 'index.html');
const html = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
const SITE = 'https://trunk.golf/';
const CANONICAL = `${SITE}welcome/`;

const meta = (attr: 'property' | 'name', key: string): string | null => {
  const m = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

/** Every tag of one name, with its attributes as a map. */
const tags = (name: string): Record<string, string>[] =>
  [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(([, attrs]) =>
    Object.fromEntries(
      [...attrs.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)].map(([, k, v]) => [k.toLowerCase(), v ?? '']),
    ),
  );

/** The page as a reader sees it: no tags, no style block, entities decoded. */
const text = html
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#39;|&rsquo;/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase();

/** Every src / href / srcset value and every CSS url(), wherever it sits. */
const refs = [
  ...[...html.matchAll(/\s(?:src|href|srcset)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]),
  ...[...html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]),
];

/** Width and height from a WebP header: lossy (VP8) or extended (VP8X). */
const webpSize = (file: string): [number, number] => {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    // 24-bit canvas width and height, each stored minus one.
    return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  }
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes) and start code 9d 01 2a, then 14-bit sizes.
    expect([...b.subarray(23, 26)]).toEqual([0x9d, 0x01, 0x2a]);
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  throw new Error(`${file}: unexpected WebP chunk ${chunk}`);
};

describe('public/welcome/index.html under the site CSP', () => {
  it('exists', () => {
    expect(html).toMatch(/^<!doctype html>/i);
  });

  it('runs no script of any kind', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it('points every root-relative reference at a real file, or at the app', () => {
    const local = refs.filter((r) => r.startsWith('/') && !r.startsWith('//'));
    expect(local.length).toBeGreaterThan(0);
    const missing = local
      .filter((r) => r !== '/' && !r.startsWith('/#'))
      .map((r) => r.split(/[?#]/)[0])
      .filter((p) => {
        const file = resolve(pub, `.${p}`);
        return !existsSync(file) || !statSync(file).isFile();
      });
    expect(missing).toEqual([]);
  });

  it('loads no image, font or stylesheet from another origin', () => {
    const external = (u: string) => /^(?:[a-z][\w+.-]*:|\/\/)/i.test(u) && !u.startsWith('data:');
    // img/source/etc. src and srcset, and CSS url(): this origin only.
    const loads = [
      ...[...html.matchAll(/\s(?:src|srcset)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]),
      ...[...html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]),
    ];
    expect(loads.filter(external)).toEqual([]);
    // <link> fetches (icon, preload, stylesheet) too; only canonical names a URL.
    const links = tags('link').filter((l) => l.rel !== 'canonical');
    expect(links.filter((l) => external(l.href ?? ''))).toEqual([]);
    expect(html).not.toMatch(/<(?:iframe|object|embed|video|audio)\b/i);
  });

  it('opens other sites with rel="noopener"', () => {
    const outbound = tags('a').filter((a) => /^https?:/.test(a.href ?? ''));
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.filter((a) => !/\bnoopener\b/.test(a.rel ?? '')).map((a) => a.href)).toEqual([]);
  });

  it('embeds nothing bigger than a small data: URI', () => {
    // The mock-up inlined every image as base64; the page must not.
    const big = [...html.matchAll(/data:[^"')\s]*/g)].filter(([d]) => d.length > 2048);
    expect(big.length).toBe(0);
  });
});

describe('public/welcome/index.html for crawlers and link unfurls', () => {
  it('is indexable', () => {
    expect(html).not.toMatch(/noindex/i);
  });

  it('carries the public title', () => {
    expect(html).toContain('<title>Trunk — Golf Side Games</title>');
    expect(meta('property', 'og:title')).toBe('Trunk — Golf Side Games');
    expect(meta('name', 'twitter:title')).toBe('Trunk — Golf Side Games');
  });

  it('is canonical at /welcome/ with the trailing slash', () => {
    expect(html).toContain(`<link rel="canonical" href="${CANONICAL}">`);
    expect(meta('property', 'og:url')).toBe(CANONICAL);
  });

  it("unfurls with the app's card", () => {
    expect(meta('property', 'og:image')).toBe(`${SITE}og.png`);
    expect(meta('property', 'og:image:alt')).toBe('Trunk — golf side games. Settle it at the trunk.');
    expect(meta('name', 'twitter:image')).toBe(`${SITE}og.png`);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'description')).toBeTruthy();
    expect(meta('name', 'theme-color')).toBe('#14694e');
  });
});

describe('public/welcome/index.html images', () => {
  const imgs = tags('img');

  it('gives every image alt text and its size', () => {
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img, img.src).toHaveProperty('alt');
      expect(img.width, img.src).toMatch(/^\d+$/);
      expect(img.height, img.src).toMatch(/^\d+$/);
    }
  });

  it('declares each image at the size of its file', () => {
    for (const img of imgs) {
      expect(img.src, 'images live under /welcome/').toMatch(/^\/welcome\/[\w-]+\.webp$/);
      const file = resolve(pub, `.${img.src}`);
      expect(existsSync(file), img.src).toBe(true);
      expect(webpSize(file), img.src).toEqual([Number(img.width), Number(img.height)]);
    }
  });

  it('lazy-loads only what is below the hero', () => {
    const hero = html.slice(0, html.indexOf('</header>'));
    const heroImgs = [...hero.matchAll(/<img\b[^>]*>/g)].map(([t]) => t);
    expect(heroImgs.length).toBeGreaterThan(0);
    expect(heroImgs.filter((t) => /loading=/.test(t))).toEqual([]);
    const below = imgs.length - heroImgs.length;
    expect(imgs.filter((i) => i.loading === 'lazy').length).toBe(below);
  });
});

describe('public/welcome/index.html content', () => {
  it('sends every call to action to the app at /', () => {
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
      href: /href="([^"]*)"/.exec(attrs)?.[1],
      label: inner.replace(/<[^>]+>/g, '').replace(/&rarr;/g, '').trim(),
    }));
    for (const label of ['Start a round', 'Open Trunk', 'Open the app', 'Trunk']) {
      const hits = anchors.filter((a) => a.label === label);
      expect(hits.length, label).toBeGreaterThan(0);
      expect(hits.map((a) => a.href), label).toEqual(hits.map(() => '/'));
    }
  });

  it('names every game in the registry', () => {
    // A game added to src/games/index.ts fails here until the page lists it.
    const missing = GAMES.map((g) => g.label).filter((label) => !text.includes(label.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('names the two round formats that are not registry games', () => {
    expect(text).toContain('golf league');
    expect(text).toContain('scramble');
  });
});

describe('the service worker leaves /welcome alone (vite.config.ts)', () => {
  // A source check: the generated worker is only built by `npm run build`.
  const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

  it('does not precache the page or its images', () => {
    const ignores = /globIgnores:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(ignores).toContain("'**/welcome/**'");
  });

  it('does not answer /welcome navigations with the app shell', () => {
    const src = /navigateFallbackDenylist:\s*\[\s*\/(.+?)\/\s*\]/.exec(config)?.[1];
    expect(src).toBeTruthy();
    const deny = new RegExp(src!);
    // Workbox matches the denylist against pathname + search.
    for (const p of ['/welcome', '/welcome/', '/welcome/?utm_source=x', '/welcome?utm_source=x']) {
      expect(deny.test(p), p).toBe(true);
    }
    for (const p of ['/', '/welcomes', '/privacy.html', '/?r=abc']) {
      expect(deny.test(p), p).toBe(false);
    }
  });
});
