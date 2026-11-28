// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isIOS,
  isWebKit,
  platformEnv,
  storageRisk,
  type PlatformEnv,
} from './platform';

/**
 * Every detection test passes its environment explicitly, so these hold
 * whatever this runner's navigator looks like. The file runs under happy-dom
 * for one reason: the last block checks that the default DOM test environment
 * reads as a plain browser, which the component tests elsewhere rely on.
 */

const env = (userAgent: string, maxTouchPoints = 0): PlatformEnv => ({ userAgent, maxTouchPoints });

const UA = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  macEdge:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.2151.72',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isIOS and isWebKit', () => {
  it.each([
    ['iPhone Safari', env(UA.iPhoneSafari, 5)],
    ['iPhone Chrome', env(UA.iPhoneChrome, 5)],
    ['iPad presenting a Mac user agent', env(UA.macSafari, 5)],
  ])('%s is iOS, and WebKit', (_name, e) => {
    expect(isIOS(e)).toBe(true);
    expect(isWebKit(e)).toBe(true);
  });

  it('macOS Safari is WebKit but not iOS', () => {
    const e = env(UA.macSafari, 0);
    expect(isIOS(e)).toBe(false);
    expect(isWebKit(e)).toBe(true);
  });

  it.each([
    ['macOS Chrome', env(UA.macChrome)],
    ['macOS Edge', env(UA.macEdge)],
    ['macOS Firefox', env(UA.macFirefox)],
    ['Android Chrome', env(UA.androidChrome, 5)],
    ['desktop Firefox', env(UA.windowsFirefox)],
  ])('%s is not WebKit', (_name, e) => {
    expect(isWebKit(e)).toBe(false);
    expect(isIOS(e)).toBe(false);
  });
});

describe('storageRisk', () => {
  it('reads an empty user agent as a plain browser, without throwing', () => {
    expect(() => storageRisk(env(''))).not.toThrow();
    expect(storageRisk(env(''))).toBe('browser');
  });

  it('is native inside the Capacitor shell, whatever the user agent', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    expect(storageRisk(env(UA.iPhoneSafari, 5))).toBe('native');
  });

  it('is installed when running standalone', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }));
    expect(storageRisk(env(UA.iPhoneSafari, 5))).toBe('installed');
  });

  it('is installed when iOS says navigator.standalone', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('navigator', { ...navigator, standalone: true });
    expect(storageRisk(env(UA.iPhoneSafari, 5))).toBe('installed');
  });

  it('is evicting in an iPhone browser tab', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(storageRisk(env(UA.iPhoneSafari, 5))).toBe('evicting');
    expect(storageRisk(env(UA.iPhoneChrome, 5))).toBe('evicting');
  });

  it('is evicting in a Safari tab on a Mac', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(storageRisk(env(UA.macSafari))).toBe('evicting');
  });

  it('is browser on Android Chrome and desktop Firefox', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(storageRisk(env(UA.androidChrome, 5))).toBe('browser');
    expect(storageRisk(env(UA.windowsFirefox))).toBe('browser');
  });

  it('does not throw out of a matchMedia that throws', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no media queries here');
    });
    expect(() => storageRisk(env(UA.iPhoneSafari, 5))).not.toThrow();
    expect(storageRisk(env(UA.iPhoneSafari, 5))).toBe('evicting');
  });
});

describe('platformEnv', () => {
  it('reads nothing, rather than throwing, where there is no navigator', () => {
    vi.stubGlobal('navigator', undefined);
    expect(platformEnv()).toEqual({ userAgent: '', maxTouchPoints: 0 });
    expect(storageRisk()).toBe('browser');
  });
});

describe('the default DOM test environment', () => {
  // Items elsewhere render components under happy-dom and rely on this. If it
  // fails, fix the detection, not this test.
  it('reads as a plain browser tab', () => {
    expect(isWebKit()).toBe(false);
    expect(storageRisk()).toBe('browser');
  });
});
