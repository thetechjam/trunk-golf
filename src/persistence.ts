/**
 * Asking the browser not to throw the rounds away.
 *
 * Everything Trunk saves lives in this origin's storage, and a browser is
 * allowed to evict that under pressure. `navigator.storage.persist()` asks for
 * the storage to be treated as persistent, which exempts it from eviction
 * under storage pressure — and that is all it promises. Chrome grants it to
 * installed or engaged sites, Firefox asks the user, and Safari implements it
 * too, granting it on its own heuristics.
 *
 * It does not lift Safari's separate seven-day rule: in a WebKit browser tab a
 * site's data is cleared after seven days of browsing without a visit whether
 * or not `persist()` said yes. Only the Home Screen app is exempt, which is why
 * the diagnostics line goes through `describeStorage` with the platform's
 * `storageRisk()` rather than reporting the browser's answer alone.
 *
 * The answer is advisory, so nothing waits on it: it is recorded for the
 * diagnostics lines in Settings, where a bug report can read it off a
 * screenshot the way it reads the build stamp.
 */

import type { StorageRisk } from './platform';

export type PersistState =
  /** The API is not there, or the request has not come back yet. */
  | 'unknown'
  /** The browser said yes: storage is exempt from eviction. */
  | 'persisted'
  /** The browser said no: storage is best-effort and may be cleared. */
  | 'best-effort';

let state: PersistState = 'unknown';

/** What the browser said, as of now. */
export const persistenceStatus = (): PersistState => state;

/** For the Settings sheet: short, one line, readable in a screenshot. */
export function describePersistence(s: PersistState = state): string {
  switch (s) {
    case 'persisted':
      return 'Storage protected';
    case 'best-effort':
      return 'Storage not protected — back up or install';
    default:
      return 'Storage status unknown';
  }
}

/**
 * Asks once. Already-persisted storage is reported without asking again, so
 * a browser that prompts does not prompt on every launch.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage
): Promise<PersistState> {
  if (!storage || typeof storage.persist !== 'function') {
    state = 'unknown';
    return state;
  }
  try {
    const already = typeof storage.persisted === 'function' ? await storage.persisted() : false;
    const granted = already || (await storage.persist());
    state = granted ? 'persisted' : 'best-effort';
  } catch {
    state = 'unknown';
  }
  return state;
}

/**
 * Reads whether storage is already persistent. Never asks, so never prompts:
 * used at a launch with nothing saved yet, where Firefox would otherwise show
 * a permission prompt to someone who has not started a round.
 */
export async function readPersistence(
  storage: Pick<StorageManager, 'persisted'> | undefined = globalThis.navigator?.storage
): Promise<PersistState> {
  if (!storage || typeof storage.persisted !== 'function') {
    state = 'unknown';
    return state;
  }
  try {
    state = (await storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    state = 'unknown';
  }
  return state;
}

/**
 * The Settings diagnostics line, which has to account for where Trunk is
 * running: a granted `persist()` in a WebKit tab is not protection from the
 * seven-day rule, so it is never shown as "protected" there.
 */
export function describeStorage(s: PersistState, risk: StorageRisk): string {
  switch (risk) {
    case 'native':
      // The sheet hides the line on native; there is nothing to report.
      return '';
    case 'evicting':
      return 'Storage: browser tab — cleared after 7 days unused';
    case 'installed':
      return s === 'persisted' ? 'Storage protected' : 'Storage: installed app';
    default:
      return describePersistence(s);
  }
}

/** Test seam. */
export function resetPersistenceForTests(): void {
  state = 'unknown';
}
