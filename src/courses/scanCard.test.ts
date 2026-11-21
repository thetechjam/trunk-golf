import { describe, it, expect, vi, afterEach } from 'vitest';
import { scanCard, ScanError, SCAN_MESSAGES, SCAN_URL, withTimeout, SCAN_TIMEOUT_MS } from './scanCard';
import { checkScan } from './scanGate';
import { rawRowSet, rawScan } from './scanFixtures';

const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

function stubFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ScanError) return e.code;
    throw e;
  }
  throw new Error('resolved');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('scanCard', () => {
  it('posts the raw JPEG bytes and returns the re-checked reading', async () => {
    const g = checkScan(rawScan([rawRowSet()]));
    const f = stubFetch(async () => jsonRes(200, { ok: true, courseName: 'Pine Valley', rowSets: g.rowSets, model: 'sonnet' }));
    const r = await scanCard(photo);
    expect(r).toEqual({ courseName: 'Pine Valley', rowSets: g.rowSets, model: 'sonnet' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(SCAN_URL);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(photo);
    expect(new Headers(init?.headers).get('content-type')).toBe('image/jpeg');
  });

  it('reads the SPA shell (HTML, 200) as unavailable, not as an empty card', async () => {
    stubFetch(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect(await codeOf(scanCard(photo))).toBe('unavailable');
  });

  it('reads a bare 429 from the rate limiter as rate_limited, whatever the body', async () => {
    stubFetch(async () => new Response(null, { status: 429 }));
    expect(await codeOf(scanCard(photo))).toBe('rate_limited');
    stubFetch(async () => new Response('<html>', { status: 429, headers: { 'Content-Type': 'text/html' } }));
    expect(await codeOf(scanCard(photo))).toBe('rate_limited');
  });

  it('reads a network failure as offline', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await codeOf(scanCard(photo))).toBe('offline');
  });

  it('does not try when the browser says it is offline', async () => {
    const f = stubFetch(async () => jsonRes(200, {}));
    vi.stubGlobal('navigator', { onLine: false });
    expect(await codeOf(scanCard(photo))).toBe('offline');
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'not_configured'],
    [503, 'paused'],
    [503, 'unavailable'],
    [422, 'no_card'],
    [422, 'unreadable'],
    [502, 'upstream'],
    [413, 'too_large'],
    [400, 'bad_request'],
    [500, 'internal'],
  ])('maps a %i %s to its own message', async (status, error) => {
    stubFetch(async () => jsonRes(status, { ok: false, error }));
    const code = await codeOf(scanCard(photo));
    expect(code).toBe(error);
    expect(new ScanError(code).message).toBe(SCAN_MESSAGES[code]);
  });

  it('maps an unknown error code to internal', async () => {
    stubFetch(async () => jsonRes(500, { ok: false, error: 'whatever' }));
    expect(await codeOf(scanCard(photo))).toBe('internal');
  });

  it('treats a 200 with nothing usable as unreadable', async () => {
    stubFetch(async () => jsonRes(200, { ok: true, courseName: 'x', rowSets: [{ holes: 'nope' }] }));
    expect(await codeOf(scanCard(photo))).toBe('unreadable');
  });

  it('times out with its own code', async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        )
    );
    const p = codeOf(scanCard(photo));
    await vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS + 1);
    expect(await p).toBe('timeout');
  });

  it("rethrows the caller's own abort untouched", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        )
    );
    const ctrl = new AbortController();
    const p = scanCard(photo, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('withTimeout', () => {
  it('follows an outer signal that is already aborted', () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const t = withTimeout(1000, ctrl.signal);
    expect(t.signal.aborted).toBe(true);
    expect(t.timedOut()).toBe(false);
    t.done();
  });
});
