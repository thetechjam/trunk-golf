import { reviveRowSets, cleanText, type ScannedRowSet } from './scanGate';

/**
 * The browser half of "Scan the card": send the prepared photo to
 * /api/scan-card and turn whatever comes back into a reading or a ScanError.
 *
 * The function lives at /api/scan-card on the same origin (netlify.toml), so
 * this needs no CSP change. It is never trusted on its status alone: where
 * the function is missing — `vite dev`, an old deploy — the SPA fallback
 * answers with index.html and a 200, and that has to read as "unavailable",
 * not as an empty card.
 */

export const SCAN_URL = '/api/scan-card';
/** Longer than the function's own 26 s budget (netlify/lib/scanCard/handler.ts), shorter than patience. */
export const SCAN_TIMEOUT_MS = 35_000;

export type ScanErrorCode =
  | 'bad_request'
  | 'forbidden'
  | 'method_not_allowed'
  | 'too_large'
  | 'unsupported_type'
  | 'no_card'
  | 'unreadable'
  | 'rate_limited'
  | 'upstream'
  | 'not_configured'
  | 'paused'
  | 'unavailable'
  | 'internal'
  | 'offline'
  | 'timeout';

const GENERIC = 'Something went wrong reading the card. Try again, or enter the pars below.';

/** What the screen says for each failure. */
export const SCAN_MESSAGES: Record<ScanErrorCode, string> = {
  bad_request: "That photo couldn't be read. Try taking it again.",
  forbidden: GENERIC,
  method_not_allowed: GENERIC,
  too_large: 'That photo is too big to send. Try again from a little further back.',
  unsupported_type: GENERIC,
  no_card:
    "That doesn't look like a scorecard. Get the whole hole-by-hole table in the frame and try again.",
  unreadable:
    "Couldn't read that card clearly. Try flatter, closer and without glare — or enter the pars below.",
  rate_limited: "That's a lot of scans in a few minutes. Give it a few minutes and try again.",
  upstream: "The card reader didn't answer. Try again in a moment.",
  not_configured: "Card scanning isn't switched on yet. Enter the pars below, or search for the course.",
  paused: 'Card scanning is paused for now. Enter the pars below, or search for the course.',
  unavailable: "Card scanning isn't available right now. Enter the pars below.",
  internal: GENERIC,
  offline: 'Scanning needs a connection. Enter the pars below.',
  timeout: 'The card reader took too long to answer. Try again, or enter the pars below.',
};

const KNOWN = new Set<string>(Object.keys(SCAN_MESSAGES));

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  constructor(code: ScanErrorCode) {
    super(SCAN_MESSAGES[code]);
    this.code = code;
    this.name = 'ScanError';
  }
}

export interface ScanReading {
  courseName: string;
  rowSets: ScannedRowSet[];
  model: string;
}

/**
 * A signal that aborts when the caller's does or when `ms` passes, and can
 * say which happened. AbortSignal.any/timeout would do this in newer
 * browsers; this works in the Safari versions Trunk still supports.
 */
export function withTimeout(ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const onOuter = () => ctrl.abort();
  if (outer?.aborted) ctrl.abort();
  else outer?.addEventListener('abort', onOuter, { once: true });
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Send a prepared JPEG; resolve with the reading or reject with a ScanError.
 * A caller's own abort rejects with the DOMException fetch threw, so a
 * screen that has moved on can ignore it.
 */
export async function scanCard(photo: Blob, signal?: AbortSignal): Promise<ScanReading> {
  if (offline()) throw new ScanError('offline');
  const t = withTimeout(SCAN_TIMEOUT_MS, signal);
  let res: Response;
  try {
    res = await fetch(SCAN_URL, {
      method: 'POST',
      // The bytes as they are: no JSON, no base64. The function checks the
      // type and the JPEG magic bytes itself.
      headers: { 'Content-Type': 'image/jpeg' },
      body: photo,
      signal: t.signal,
    });
  } catch (err) {
    t.done();
    if (signal?.aborted) throw err;
    if (t.timedOut()) throw new ScanError('timeout');
    throw new ScanError('offline');
  }

  try {
    // Netlify's rate limiter answers 429 with an empty body, before the
    // function runs. The status is the whole message.
    if (res.status === 429) throw new ScanError('rate_limited');

    let body: unknown;
    const type = res.headers.get('content-type') ?? '';
    try {
      body = type.includes('application/json') ? await res.json() : undefined;
    } catch {
      body = undefined;
    }
    if (typeof body !== 'object' || body === null) throw new ScanError('unavailable');
    const b = body as Record<string, unknown>;

    if (res.ok && b.ok === true) {
      const rowSets = reviveRowSets(b.rowSets);
      if (rowSets.length === 0) throw new ScanError('unreadable');
      return {
        courseName: cleanText(b.courseName),
        rowSets,
        model: b.model === 'sonnet' ? 'sonnet' : 'haiku',
      };
    }
    const code = typeof b.error === 'string' && KNOWN.has(b.error) ? (b.error as ScanErrorCode) : 'internal';
    throw new ScanError(code);
  } catch (err) {
    if (err instanceof ScanError) throw err;
    if (signal?.aborted) throw err;
    if (t.timedOut()) throw new ScanError('timeout');
    throw new ScanError('unavailable');
  } finally {
    t.done();
  }
}
