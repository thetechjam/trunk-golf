import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  normalize,
  indexRows,
  searchSnapshot,
  courseFromRow,
  loadSnapshot,
  fetchSnapshotCourse,
  resetSnapshot,
  SNAPSHOT_URL,
  type SnapshotRow,
} from './snapshot';
import { sliceCourseHoles } from './openGolfApi';

const FULL_SI = [7, 15, 3, 11, 1, 17, 9, 5, 13, 8, 16, 4, 12, 2, 18, 10, 6, 14];

/** Sorted by name, as the build script writes them. */
const ROWS: SnapshotRow[] = [
  ['Augusta National Golf Club', 'Augusta', 'GA', 72, '454343454445344354', FULL_SI],
  ['Bethpage Black', 'Farmingdale', 'NY', 71, '4.4453..4.4.344.44'],
  ['Pebble Beach Golf Links', 'Pebble Beach', 'CA', 72, '453434354443453435'],
  ['Pine Valley Golf Club', 'Pine Valley', 'NJ', 70, ''],
  ['Spyglass Hill', 'Pebble Beach', 'CA', 72, '5.3.4.4.4'],
  ['The Links at Pebble Creek', 'Fort Myers', 'FL', 36, '..4......'],
  ['Valle Château', 'Québec', 'QC', 0, '434543434'],
];
const ENTRIES = indexRows(ROWS);

afterEach(() => {
  resetSnapshot();
  vi.unstubAllGlobals();
});

describe('searching the offline course list', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(normalize("  Saint-André's  GC ")).toBe('saint andre s gc');
  });

  it('puts names that start with the search first, then word starts, then the rest', () => {
    const hits = searchSnapshot(ENTRIES, 'pebble');
    expect(hits.map((h) => h.name)).toEqual([
      'Pebble Beach Golf Links',
      'The Links at Pebble Creek',
    ]);
  });

  it('needs every word, and lets the town or state carry some of them', () => {
    expect(searchSnapshot(ENTRIES, 'spyglass ca').map((h) => h.name)).toEqual(['Spyglass Hill']);
    expect(searchSnapshot(ENTRIES, 'spyglass ny')).toEqual([]);
    // A place alone is not a course name; it would list a whole state.
    expect(searchSnapshot(ENTRIES, 'pebble beach ca').map((h) => h.name)).toEqual([
      'Pebble Beach Golf Links',
    ]);
    expect(searchSnapshot(ENTRIES, 'farmingdale')).toEqual([]);
  });

  it('matches without the accents', () => {
    expect(searchSnapshot(ENTRIES, 'chateau').map((h) => h.name)).toEqual(['Valle Château']);
  });

  it('returns hits shaped like the live ones, marked offline', () => {
    expect(searchSnapshot(ENTRIES, 'augusta')).toEqual([
      {
        id: 'offline:0',
        name: 'Augusta National Golf Club',
        city: 'Augusta',
        state: 'GA',
        par: 72,
        offline: true,
      },
    ]);
    expect(searchSnapshot(ENTRIES, 'valle')[0]).toMatchObject({ par: null });
  });

  it('caps the list and ignores an empty search', () => {
    expect(searchSnapshot(ENTRIES, 'a', 2)).toHaveLength(2);
    expect(searchSnapshot(ENTRIES, ' -- ')).toEqual([]);
  });
});

describe('a course from the offline list', () => {
  it('passes a complete card through with its stroke indexes', () => {
    const c = courseFromRow(ROWS[0], 'offline:0');
    expect(c.holes).toHaveLength(18);
    expect(c.holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 7 });
    expect(c.hasStrokeIndex).toBe(true);
    expect(c.estimated).toEqual([]);
    expect(c.listedPar).toBe(72);
    expect(c.offline).toBe(true);
  });

  it('fills the holes the list is missing at par 4 and names them', () => {
    const c = courseFromRow(ROWS[1], 'offline:1');
    expect(c.holes).toHaveLength(18);
    expect(c.holes.map((h) => h.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(c.estimated).toEqual([2, 7, 8, 10, 12, 16]);
    for (const n of c.estimated!) expect(c.holes[n - 1].par).toBe(4);
    expect(c.holes[4].par).toBe(5);
    // No stroke index is made up, so net play is not offered on a guess.
    expect(c.hasStrokeIndex).toBe(false);
    expect(c.holes.every((h) => h.strokeIndex === undefined)).toBe(true);
  });

  it('keeps a nine-hole course at nine', () => {
    const c = courseFromRow(ROWS[5], 'offline:5');
    expect(c.holes).toHaveLength(9);
    expect(c.estimated).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it('hands over no holes when the list has no scorecard, as live search does', () => {
    const c = courseFromRow(ROWS[3], 'offline:3');
    expect(c.holes).toEqual([]);
    expect(c.hasStrokeIndex).toBe(false);
  });

  it('slices for the back nine like a live card', () => {
    const back = sliceCourseHoles(courseFromRow(ROWS[0], 'offline:0').holes, 9, { nine: 'back' });
    expect(back.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect([...back.map((h) => h.strokeIndex)].sort((a, b) => a! - b!)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    const partial = sliceCourseHoles(courseFromRow(ROWS[1], 'offline:1').holes, 9, {
      nine: 'back',
    });
    expect(partial.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe('loading the offline list', () => {
  const answer = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body }));

  it('fetches the file from this site once and reuses it', async () => {
    const fetch = answer({ format: 1, courses: ROWS });
    vi.stubGlobal('fetch', fetch);
    await loadSnapshot();
    const course = await fetchSnapshotCourse('offline:2');
    expect(course.name).toBe('Pebble Beach Golf Links');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([SNAPSHOT_URL, expect.anything()]);
    // Nothing typed travels with the request.
    expect(SNAPSHOT_URL).toBe('/courses/opengolfapi-us.json');
  });

  it('refuses a file in a format it does not know, and tries again next time', async () => {
    vi.stubGlobal('fetch', answer({ format: 2, courses: [] }));
    await expect(loadSnapshot()).rejects.toThrow(/format/);
    vi.stubGlobal('fetch', answer({ format: 1, courses: ROWS }));
    await expect(loadSnapshot()).resolves.toHaveLength(ROWS.length);
  });

  it('says when it cannot find a course it was asked for', async () => {
    vi.stubGlobal('fetch', answer({ format: 1, courses: ROWS }));
    await expect(fetchSnapshotCourse('offline:99')).rejects.toThrow(/No course/);
  });
});
