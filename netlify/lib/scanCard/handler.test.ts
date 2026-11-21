import { describe, it, expect, vi, afterEach } from 'vitest';
import { createScanHandler, MAX_BYTES, TIMING, type ScanDeps } from './handler';
import type { ModelChoice, ReadResult, ScanFailure } from './readCard';
import { PARS, SI, rawRowSet, rawScan } from '../../../src/courses/scanFixtures';

const URL_ = 'https://trunk.golf/api/scan-card';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const KEY_SENTINEL = 'sk-SENTINEL-KEY-never-log-me';
const BODY_SENTINEL = 'SENTINEL-BODY-BYTES';
const OUTPUT_SENTINEL = 'SENTINEL-MODEL-OUTPUT';

const post = (body: BodyInit | null = JPEG, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'image/jpeg', ...headers },
  });

const result = (raw: unknown, stopReason = 'end_turn'): ReadResult => ({
  raw,
  stopReason,
  inputTokens: 100,
  outputTokens: 50,
});

class FakeError extends Error {
  constructor(public kind: ScanFailure) {
    super(`upstream said ${OUTPUT_SENTINEL}`);
  }
}

/**
 * A handler with a scripted model: each call takes the next answer for that
 * model. A FakeError is thrown; anything else is returned.
 */
function setup(script: Partial<Record<ModelChoice, (ReadResult | FakeError)[]>>, over: Partial<ScanDeps> = {}) {
  const calls: ModelChoice[] = [];
  const read = vi.fn(async (model: ModelChoice) => {
    calls.push(model);
    const next = script[model]?.shift();
    if (!next) throw new Error(`no scripted answer for ${model}`);
    if (next instanceof FakeError) throw next;
    return next;
  });
  const makeRead = vi.fn(() => read);
  const log = vi.fn();
  const handler = createScanHandler({
    apiKey: KEY_SENTINEL,
    makeRead,
    classify: (err) => (err instanceof FakeError ? err.kind : 'internal'),
    log,
    ...over,
  });
  return { handler, calls, read, makeRead, log };
}

const clean = () => result(rawScan([rawRowSet()]));
/** Structurally fine, but a par of 7 and totals that do not add up. */
const flagged = () => {
  const r = rawRowSet();
  (r.holes as { par: number }[])[2].par = 7;
  return result(rawScan([r]));
};
/** Out, In and Total read as holes: nothing survives. */
const broken = () =>
  result(
    rawScan([
      rawRowSet({
        holes: [...PARS, 36, 36, 72].map((par, i) => ({ number: i + 1, par, stroke_index: null })),
      }),
    ])
  );

async function body(res: Response) {
  return JSON.parse(await res.text());
}

afterEach(() => vi.restoreAllMocks());

describe('scan-card handler: the reading', () => {
  it('returns a clean Haiku reading without asking Sonnet', async () => {
    const { handler, calls } = setup({ haiku: [clean()] });
    const res = await handler(post());
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.model).toBe('haiku');
    expect(b.courseName).toBe('Pine Valley');
    expect(b.rowSets).toHaveLength(1);
    expect(b.rowSets[0].holes[0]).toEqual({ number: 1, par: 4, strokeIndex: SI[0] });
    expect(calls).toEqual(['haiku']);
  });

  it('says no_card on found:false and never calls Sonnet', async () => {
    const { handler, calls } = setup({ haiku: [result({ found: false, course_name: null, notes: '', row_sets: [] })] });
    const res = await handler(post());
    expect(res.status).toBe(422);
    expect(await body(res)).toEqual({ ok: false, error: 'no_card' });
    expect(calls).toEqual(['haiku']);
  });

  it('retries on Sonnet when Haiku read Out/In/Total as holes, and uses Sonnet', async () => {
    const { handler, calls } = setup({ haiku: [broken()], sonnet: [clean()] });
    const res = await handler(post());
    expect(res.status).toBe(200);
    expect((await body(res)).model).toBe('sonnet');
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it('keeps flagged rows when both readings fail the checks but Haiku was usable', async () => {
    const { handler, calls } = setup({ haiku: [flagged()], sonnet: [broken()] });
    const res = await handler(post());
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.model).toBe('haiku');
    expect(b.rowSets[0].holes[2].par).toBe(7);
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it('prefers a flagged Sonnet reading to a flagged Haiku one', async () => {
    const { handler } = setup({ haiku: [flagged()], sonnet: [flagged()] });
    expect((await body(await handler(post()))).model).toBe('sonnet');
  });

  it('says unreadable when neither reading survives', async () => {
    const { handler, calls } = setup({ haiku: [broken()], sonnet: [broken()] });
    const res = await handler(post());
    expect(res.status).toBe(422);
    expect(await body(res)).toEqual({ ok: false, error: 'unreadable' });
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it.each(['refusal', 'max_tokens'])('treats a Haiku %s as a failed attempt and retries', async (stop) => {
    const { handler, calls } = setup({ haiku: [result(rawScan([rawRowSet()]), stop)], sonnet: [clean()] });
    const res = await handler(post());
    expect(res.status).toBe(200);
    expect((await body(res)).model).toBe('sonnet');
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it('treats unparseable output as a failed attempt', async () => {
    const { handler, calls } = setup({ haiku: [result(undefined)], sonnet: [result('garbage')] });
    expect((await handler(post())).status).toBe(422);
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it("returns Haiku's reading when Sonnet throws", async () => {
    const { handler } = setup({ haiku: [flagged()], sonnet: [new FakeError('upstream')] });
    const res = await handler(post());
    expect(res.status).toBe(200);
    expect((await body(res)).model).toBe('haiku');
  });

  it('tries Sonnet when Haiku times out, and reports upstream when both do', async () => {
    const { handler, calls } = setup({ haiku: [new FakeError('upstream')], sonnet: [new FakeError('upstream')] });
    const res = await handler(post());
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ ok: false, error: 'upstream' });
    expect(calls).toEqual(['haiku', 'sonnet']);
  });

  it.each([
    ['paused', 503],
    ['unavailable', 503],
    ['internal', 500],
  ] as const)('stops at a %s error without trying Sonnet', async (kind, status) => {
    const { handler, calls } = setup({ haiku: [new FakeError(kind)] });
    const res = await handler(post());
    expect(res.status).toBe(status);
    expect(await body(res)).toEqual({ ok: false, error: kind });
    expect(calls).toEqual(['haiku']);
  });

  it('skips the retry when the deadline would not allow it', async () => {
    // The clock reads 0 at the start and 30 s from then on: a slow Haiku.
    let first = true;
    const now = () => (first ? ((first = false), 0) : 30_000);
    const { handler, calls } = setup({ haiku: [flagged()] }, { now });
    const res = await handler(post());
    expect(res.status).toBe(200);
    expect(calls).toEqual(['haiku']);
  });
});

describe('scan-card handler: the request', () => {
  it('answers 503 not_configured with no key, without reading the body or the model', async () => {
    const { handler, read, makeRead } = setup({}, { apiKey: '' });
    const req = post();
    const spy = vi.spyOn(req, 'arrayBuffer');
    const res = await handler(req);
    expect(res.status).toBe(503);
    expect(await body(res)).toEqual({ ok: false, error: 'not_configured' });
    expect(read).not.toHaveBeenCalled();
    expect(makeRead).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  it('treats an absent key the same way', async () => {
    const { handler } = setup({}, { apiKey: undefined });
    expect((await handler(post())).status).toBe(503);
  });

  it.each([
    ['GET', () => new Request(URL_), 405, 'method_not_allowed'],
    ['a foreign Origin', () => post(JPEG, { Origin: 'https://evil.example' }), 403, 'forbidden'],
    ['a malformed Origin', () => post(JPEG, { Origin: 'null' }), 403, 'forbidden'],
    ['a PNG content type', () => post(PNG, { 'Content-Type': 'image/png' }), 415, 'unsupported_type'],
    ['JSON', () => post('{}', { 'Content-Type': 'application/json' }), 415, 'unsupported_type'],
    ['PNG bytes labelled as JPEG', () => post(PNG), 400, 'bad_request'],
    ['an empty body', () => post(new Uint8Array(0)), 400, 'bad_request'],
    ['an oversize body', () => post(new Uint8Array(MAX_BYTES + 1).fill(0xff)), 413, 'too_large'],
    [
      'an oversize Content-Length',
      () => post(JPEG, { 'Content-Length': String(MAX_BYTES + 1) }),
      413,
      'too_large',
    ],
  ])('refuses %s', async (_, make, status, error) => {
    const { handler, read } = setup({});
    const res = await handler(make());
    expect(res.status).toBe(status);
    expect(await body(res)).toEqual({ ok: false, error });
    expect(read).not.toHaveBeenCalled();
  });

  it('accepts its own Origin and a content type with parameters', async () => {
    const { handler } = setup({ haiku: [clean()] });
    const res = await handler(post(JPEG, { Origin: 'https://trunk.golf', 'Content-Type': 'image/jpeg; q=1' }));
    expect(res.status).toBe(200);
  });

  it('sends the photo to the model as base64', async () => {
    const { handler, read } = setup({ haiku: [clean()] });
    await handler(post());
    expect(read).toHaveBeenCalledWith('haiku', Buffer.from(JPEG).toString('base64'), TIMING.haikuTimeoutMs);
  });

  it('marks every response JSON, uncached and unsniffable', async () => {
    const { handler } = setup({ haiku: [clean()] });
    for (const res of [await handler(post()), await handler(new Request(URL_))]) {
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });
});

describe('scan-card handler: logging', () => {
  it('logs one line of numbers and never the key, photo, model output or error text', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
    const lines: string[] = [];
    const scripted = rawScan([rawRowSet({ label: OUTPUT_SENTINEL })]);
    const photo = new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode(BODY_SENTINEL)]);
    const { handler } = setup(
      { haiku: [result(scripted)], sonnet: [new FakeError('upstream')] },
      { log: (l) => lines.push(l) }
    );
    // The scripted row set is clean, so swap in a flagged one to force the
    // Sonnet path and its error.
    (scripted.row_sets[0] as { holes: { par: number }[] }).holes[0].par = 9;
    const res = await handler(post(photo));
    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^scan-card outcome=ok_flagged model=haiku attempts=2 ms=\d+ in=100 out=50$/);

    // And the default logger goes to console.log, still clean.
    const { handler: h2 } = setup({ haiku: [new FakeError('internal')] }, { log: undefined });
    await h2(post(photo));

    const printed = [lines.join('\n'), ...spies.flatMap((s) => s.mock.calls.map((c) => c.join(' ')))].join('\n');
    for (const sentinel of [KEY_SENTINEL, BODY_SENTINEL, OUTPUT_SENTINEL, 'upstream said']) {
      expect(printed).not.toContain(sentinel);
    }
    expect(spies[0]).toHaveBeenCalledTimes(1);
  });
});
