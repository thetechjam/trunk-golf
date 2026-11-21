import { checkScan, type GateResult, type ScannedRowSet } from '../../../src/courses/scanGate';
import type { ModelChoice, ReadResult, ScanFailure } from './readCard';

/**
 * POST /api/scan-card — a photo of a printed scorecard in, the pars and
 * stroke indexes read off it out.
 *
 * Built from injected parts so it can be tested without the SDK, a key or a
 * network: `netlify/functions/scan-card.mts` wires the real ones. The order of
 * the request checks is deliberate — the cheap refusals that need nothing come
 * first, and the body is never read when the feature is switched off.
 */

/**
 * Every timing in the scan path, in one place.
 *
 * Netlify documents a 60 s limit for synchronous functions, but measured on
 * this site's deploy preview (November 2026) a request that sent nothing back
 * for 30 s was cut off by the edge with an HTML "Inactivity Timeout" 504: a
 * 28 s response arrived, a 40 s one did not. So the handler budgets 26 s in
 * all — Haiku gets 10 s, and Sonnet's 14 s retry is only started when it can
 * still finish inside the budget. The client waits 35 s (src/courses/scanCard.ts).
 */
export const TIMING = {
  budgetMs: 26_000,
  haikuTimeoutMs: 10_000,
  sonnetTimeoutMs: 14_000,
} as const;

/** Largest JPEG accepted. The browser sends ~1568 px at q0.85, well under 1.5 MB. */
export const MAX_BYTES = 2_500_000;

export type ScanCode =
  | 'bad_request'
  | 'forbidden'
  | 'method_not_allowed'
  | 'too_large'
  | 'unsupported_type'
  | 'no_card'
  | 'unreadable'
  | 'upstream'
  | 'not_configured'
  | 'paused'
  | 'unavailable'
  | 'internal';

export interface ScanSuccess {
  ok: true;
  courseName: string;
  rowSets: ScannedRowSet[];
  model: ModelChoice;
}

export type ReadFn = (model: ModelChoice, jpegBase64: string, timeoutMs: number) => Promise<ReadResult>;

export interface ScanDeps {
  /** The key, read from the environment by the caller. Absent or empty switches the feature off. */
  apiKey: string | undefined;
  /** Builds the model reader for a key. Only called once the request has passed every check. */
  makeRead: (apiKey: string) => ReadFn;
  classify: (err: unknown) => ScanFailure;
  now?: () => number;
  /** One line per request. Never handed the key, the photo, the reply or an error message. */
  log?: (line: string) => void;
}

const STATUS: Record<ScanCode, number> = {
  bad_request: 400,
  forbidden: 403,
  method_not_allowed: 405,
  too_large: 413,
  unsupported_type: 415,
  no_card: 422,
  unreadable: 422,
  upstream: 502,
  not_configured: 503,
  paused: 503,
  unavailable: 503,
  internal: 500,
};

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

const fail = (code: ScanCode) =>
  json(STATUS[code], { ok: false, error: code }, code === 'method_not_allowed' ? { Allow: 'POST' } : {});

/**
 * The request body, read no further than the cap. Content-Length is checked
 * first, but it is the client's claim; this is the measurement.
 */
async function readCapped(req: Request): Promise<Uint8Array | 'too_large'> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return 'too_large';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** A reading the screen can offer: there is at least one row set to pick. */
const usable = (g: GateResult | null): GateResult | null => (g && g.rowSets.length > 0 ? g : null);

interface Attempt {
  gate: GateResult | null;
  error: ScanFailure | null;
}

export function createScanHandler(deps: ScanDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));

  return async (req: Request): Promise<Response> => {
    const started = now();
    let attempts = 0;
    let model: ModelChoice | '-' = '-';
    let inTokens = 0;
    let outTokens = 0;

    const finish = (res: Response, outcome: string) => {
      // Numbers and fixed words only. Never the key, the photo, what the model
      // said, an error's message, or who asked.
      log(
        `scan-card outcome=${outcome} model=${model} attempts=${attempts} ms=${now() - started} in=${inTokens} out=${outTokens}`
      );
      return res;
    };
    const refuse = (code: ScanCode) => finish(fail(code), code);

    if (req.method !== 'POST') return refuse('method_not_allowed');

    // Same-origin only. A browser always sends Origin on a cross-site POST;
    // curl and the app's own fetch from the same host either omit it or match.
    const origin = req.headers.get('origin');
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === new URL(req.url).host;
      } catch {
        ok = false;
      }
      if (!ok) return refuse('forbidden');
    }

    const apiKey = deps.apiKey?.trim();
    if (!apiKey) return refuse('not_configured');

    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'image/jpeg') return refuse('unsupported_type');

    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return refuse('too_large');

    let bytes: Uint8Array | 'too_large';
    try {
      bytes = await readCapped(req);
    } catch {
      return refuse('bad_request');
    }
    if (bytes === 'too_large') return refuse('too_large');
    if (!isJpeg(bytes)) return refuse('bad_request');

    const b64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    let read: ReadFn;
    try {
      read = deps.makeRead(apiKey);
    } catch {
      return refuse('internal');
    }

    const attempt = async (choice: ModelChoice, timeoutMs: number): Promise<Attempt> => {
      attempts++;
      model = choice;
      try {
        const r = await read(choice, b64, timeoutMs);
        inTokens += r.inputTokens;
        outTokens += r.outputTokens;
        // A reply cut off at max_tokens, or declined, is not a reading.
        if (r.stopReason === 'max_tokens' || r.stopReason === 'refusal') return { gate: null, error: null };
        return { gate: checkScan(r.raw), error: null };
      } catch (err) {
        return { gate: null, error: deps.classify(err) };
      }
    };

    const ok = (g: GateResult, choice: ModelChoice, outcome: string) => {
      model = choice;
      const body: ScanSuccess = { ok: true, courseName: g.courseName, rowSets: g.rowSets, model: choice };
      return finish(json(200, body), outcome);
    };

    const first = await attempt('haiku', TIMING.haikuTimeoutMs);
    if (first.gate && !first.gate.found) return refuse('no_card');
    if (first.gate?.clean) return ok(first.gate, 'haiku', 'ok');
    // A spend cap or a bad key fails the second model the same way.
    if (first.error === 'paused' || first.error === 'unavailable' || first.error === 'internal') {
      return refuse(first.error);
    }

    const left = TIMING.budgetMs - (now() - started);
    const haikuUsable = usable(first.gate);
    if (left < TIMING.sonnetTimeoutMs) {
      if (haikuUsable) return ok(haikuUsable, 'haiku', 'ok_no_time');
      return refuse(first.error ?? 'unreadable');
    }

    const second = await attempt('sonnet', TIMING.sonnetTimeoutMs);
    const sonnetUsable = usable(second.gate);
    if (sonnetUsable) return ok(sonnetUsable, 'sonnet', sonnetUsable.clean ? 'ok' : 'ok_flagged');
    if (haikuUsable) return ok(haikuUsable, 'haiku', 'ok_flagged');
    if (second.error) return refuse(second.error);
    // Haiku gave nothing to go on and Sonnet says it is not a scorecard.
    if (second.gate && !second.gate.found && !first.gate) return refuse('no_card');
    return refuse('unreadable');
  };
}
