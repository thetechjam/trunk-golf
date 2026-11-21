import { describe, it, expect, afterEach, vi } from 'vitest';
import { findCourses, loadCourse } from './findCourses';
import { resetSnapshot, SNAPSHOT_URL, type SnapshotRow } from './snapshot';
import { SEARCH_TIMEOUT_MS, CourseTimeoutError } from './openGolfApi';

const ROWS: SnapshotRow[] = [
  ['Pebble Beach Golf Links', 'Pebble Beach', 'CA', 72, '453434354443453.35'],
];
const LIVE_HIT = { id: 'live-1', name: 'Pebble Beach (live)', city: 'Pebble Beach', state: 'CA', par: 72 };

type Live = 'hits' | 'empty' | '503' | 'network' | 'hang';

/**
 * A fetch that answers the live API one way and the offline list another,
 * and records which of the two was asked.
 */
function stub(live: Live, list: 'ok' | 'fail' = 'ok') {
  const calls: string[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    calls.push(url === SNAPSHOT_URL ? 'list' : 'live');
    if (url === SNAPSHOT_URL) {
      return Promise.resolve(
        list === 'ok'
          ? { ok: true, json: async () => ({ format: 1, courses: ROWS }) }
          : { ok: false, status: 404, json: async () => ({}) }
      );
    }
    if (live === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (live === 'hang') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      });
    }
    if (live === '503') return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
    return Promise.resolve({
      ok: true,
      json: async () => ({ courses: live === 'hits' ? [LIVE_HIT] : [] }),
    });
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

afterEach(() => {
  resetSnapshot();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('course search with the offline fallback', () => {
  it('uses live results and never downloads the list when live answers', async () => {
    const calls = stub('hits');
    const out = await findCourses('pebble');
    expect(out).toEqual({ hits: [LIVE_HIT], offline: false });
    expect(calls).toEqual(['live']);
  });

  it.each<Live>(['503', 'network'])('falls back to the list when live fails (%s)', async (live) => {
    const calls = stub(live);
    const out = await findCourses('pebble');
    expect(out.offline).toBe(true);
    expect(out.hits.map((h) => h.name)).toEqual(['Pebble Beach Golf Links']);
    expect(calls).toEqual(['live', 'list']);
  });

  it('falls back after the short live timeout, not the long one', async () => {
    vi.useFakeTimers();
    stub('hang');
    const pending = findCourses('pebble');
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ offline: true, hits: [{ offline: true }] });
  });

  it('checks the list when live answers with nothing', async () => {
    const calls = stub('empty');
    const out = await findCourses('pebble');
    expect(out.offline).toBe(true);
    expect(out.hits).toHaveLength(1);
    expect(calls).toEqual(['live', 'list']);
  });

  it('says "no matches" when both come up empty, as a live answer', async () => {
    stub('empty');
    await expect(findCourses('augusta')).resolves.toEqual({ hits: [], offline: false });
  });

  it('marks an empty list answer as offline when live had failed', async () => {
    stub('503');
    await expect(findCourses('augusta')).resolves.toEqual({ hits: [], offline: true });
  });

  it('keeps a live "nothing" when the list cannot be read', async () => {
    stub('empty', 'fail');
    await expect(findCourses('pebble')).resolves.toEqual({ hits: [], offline: false });
  });

  it('reports the live failure when the list cannot be read either', async () => {
    vi.useFakeTimers();
    stub('hang', 'fail');
    const pending = findCourses('pebble');
    const asserted = expect(pending).rejects.toBeInstanceOf(CourseTimeoutError);
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
    await asserted;
  });

  it('lets the caller cancel without falling back', async () => {
    const calls = stub('hang');
    const ctrl = new AbortController();
    const pending = findCourses('pebble', ctrl.signal);
    const asserted = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    ctrl.abort();
    await asserted;
    expect(calls).toEqual(['live']);
  });

  it('loads an offline pick from the list and a live pick from the service', async () => {
    const calls = stub('503');
    const { hits } = await findCourses('pebble');
    const course = await loadCourse(hits[0]);
    expect(course).toMatchObject({ name: 'Pebble Beach Golf Links', offline: true, estimated: [16] });
    expect(course.holes).toHaveLength(18);
    expect(calls).toEqual(['live', 'list']);

    const liveCalls = stub('hits');
    await loadCourse(LIVE_HIT);
    expect(liveCalls).toEqual(['live']);
  });
});
