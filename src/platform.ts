import { isNative } from './native';

/**
 * Where Trunk is running, as far as its saved rounds are concerned.
 *
 * The one fact that matters is how exposed this install's storage is. WebKit
 * — every iOS browser, and Safari on a Mac — deletes a site's script-writable
 * storage after seven days of browsing without a visit, unless the site runs
 * as a Home Screen (or Dock) app. That app gets its own, separate storage, so
 * it starts empty. Chromium and Firefox do neither. Everything that changes
 * copy or nudges by platform reads `storageRisk()` rather than sniffing again.
 *
 * Misdetection is cheap in both directions: a non-WebKit browser read as
 * WebKit gets a slightly earlier backup reminder; a WebKit browser missed
 * gets the plain browser behaviour Trunk had before.
 */

export type StorageRisk =
  /** Capacitor shell: Preferences store, no eviction. */
  | 'native'
  /** Home Screen / Dock / installed PWA. */
  | 'installed'
  /** WebKit in a browser tab: the seven-day rule applies. */
  | 'evicting'
  /** Any other browser tab. */
  | 'browser';

export interface PlatformEnv {
  userAgent: string;
  maxTouchPoints: number;
}

/** Reads navigator; safe where navigator is undefined (node tests). */
export function platformEnv(): PlatformEnv {
  try {
    const nav = globalThis.navigator;
    return {
      userAgent: typeof nav?.userAgent === 'string' ? nav.userAgent : '',
      maxTouchPoints: typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
    };
  } catch {
    return { userAgent: '', maxTouchPoints: 0 };
  }
}

/**
 * iPhone, iPad, iPod — including iPadOS, which presents a Mac user agent by
 * default and gives itself away only by having a touch screen.
 */
export function isIOS(env: PlatformEnv = platformEnv()): boolean {
  const ua = env.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
}

/**
 * Every iOS browser, and desktop Safari: the engines the seven-day rule lives
 * in. Not keyed on `AppleWebKit` — Chrome and happy-dom both carry it — nor on
 * `navigator.vendor`.
 */
export function isWebKit(env: PlatformEnv = platformEnv()): boolean {
  if (isIOS(env)) return true;
  const ua = env.userAgent;
  return (
    /Macintosh/.test(ua) &&
    /Version\/[\d.]+.*Safari\//.test(ua) &&
    !/Chrome|Chromium|Edg\//.test(ua)
  );
}

/**
 * True when Trunk is already out of a browser tab: the native shell, or added
 * to the home screen. Safari's seven-day eviction does not apply there, which
 * is why the install hint stands down.
 */
export function isInstalled(): boolean {
  if (isNative()) return true;
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    // A test environment with a matchMedia that throws is not installed.
  }
  try {
    return (globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  } catch {
    return false;
  }
}

/** How exposed this install's saved rounds are. Never throws. */
export function storageRisk(env: PlatformEnv = platformEnv()): StorageRisk {
  try {
    if (isNative()) return 'native';
    if (isInstalled()) return 'installed';
    if (isWebKit(env)) return 'evicting';
  } catch {
    // Fall through to the least alarming answer.
  }
  return 'browser';
}
