// The offline course list: a slim copy of the OpenGolfAPI open-data dump,
// built by scripts/course-snapshot.mjs and served from this site at
// /courses/opengolfapi-us.json. Fetched only when live search fails or comes
// back empty, never part of the app bundle or the precache; the service
// worker keeps a copy once it has been fetched (vite.config.ts), so it also
// answers with no signal at all after the first time.
//
// Searching it happens on the phone. Nothing is sent anywhere: the file is
// the same for everybody and the request for it carries no search text.

import type { Hole } from '../types';
import { COURSE_REQUEST_TIMEOUT_MS, withTimeout, type CourseHit, type FetchedCourse } from './openGolfApi';

export const SNAPSHOT_URL = `${import.meta.env.BASE_URL}courses/opengolfapi-us.json`;

/** The par every hole the list has no entry for is set to — the app's own blank-card par. */
export const ESTIMATED_PAR = 4;

/** `[name, city, state, par, pars, strokeIndexes?]` — see the build script for the packing. */
export type SnapshotRow = [string, string, string, number, string, number[]?];

/** A row with its search keys worked out once, not on every keystroke. */
export interface SnapshotEntry {
  row: SnapshotRow;
  name: string;
  place: string;
}

const ID_PREFIX = 'offline:';

/** Lowercase, accents off, punctuation to spaces: "Saint-André's" → "saint andre s". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function indexRows(rows: SnapshotRow[]): SnapshotEntry[] {
  return rows.map((row) => ({
    row,
    name: ` ${normalize(row[0])}`,
    place: ` ${normalize(`${row[1]} ${row[2]}`)}`,
  }));
}

let loading: Promise<SnapshotEntry[]> | null = null;

/**
 * The list, fetched once per launch and shared by every search after. A failed
 * fetch is forgotten, so the next search tries again rather than inheriting it.
 */
export function loadSnapshot(signal?: AbortSignal): Promise<SnapshotEntry[]> {
  if (!loading) {
    // Not tied to the caller's signal: typing on past a search should not
    // throw away a download the next keystroke is about to need.
    const timed = withTimeout(undefined, COURSE_REQUEST_TIMEOUT_MS * 2);
    loading = fetch(SNAPSHOT_URL, { signal: timed.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Offline course list failed (${res.status})`);
        const data = (await res.json()) as { format?: number; courses?: SnapshotRow[] };
        if (data.format !== 1 || !Array.isArray(data.courses)) {
          throw new Error('Offline course list is in a format this version cannot read');
        }
        return indexRows(data.courses);
      })
      .catch((err: unknown) => {
        loading = null;
        throw err;
      })
      .finally(() => timed.done());
  }
  const pending = loading;
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** For tests: forget the loaded list. */
export function resetSnapshot(): void {
  loading = null;
}

/**
 * Courses whose name, city or state hold every word typed, best first:
 * names that start with what was typed, then names where every word starts
 * a word, then the rest. Ties keep the list's own order, which is by name.
 */
export function searchSnapshot(entries: SnapshotEntry[], q: string, limit = 8): CourseHit[] {
  const query = normalize(q);
  const words = query.split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: { i: number; score: number }[] = [];
  entries.forEach((e, i) => {
    let inName = 0;
    let atStart = 0;
    for (const w of words) {
      if (e.name.includes(w)) {
        inName++;
        if (e.name.includes(` ${w}`)) atStart++;
      } else if (!e.place.includes(w)) {
        return;
      }
    }
    if (inName === 0) return;
    const score = e.name.startsWith(` ${query}`)
      ? 0
      : atStart === words.length
        ? 1
        : inName === words.length
          ? 2
          : 3;
    scored.push({ i, score });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, limit).map(({ i }) => {
    const [name, city, state, par] = entries[i].row;
    return {
      id: `${ID_PREFIX}${i}`,
      name,
      city: city || null,
      state: state || null,
      par: par || null,
      offline: true,
    };
  });
}

/**
 * One row as the scorecard the rest of the app already takes from live search.
 *
 * Most courses in the list are missing some holes. Those are filled at par 4
 * and listed in `estimated`, so the card is whole (a round is never quietly
 * cut to the holes that happened to be there) and the screen can say which
 * holes to check. Stroke indexes come through only as a full set; the build
 * script drops a partial one, so `hasStrokeIndex` is never true on a guess.
 */
export function courseFromRow(row: SnapshotRow, id: string): FetchedCourse {
  const [name, , , par, pars, si] = row;
  const estimated: number[] = [];
  const holes: Hole[] = [...pars].map((ch, i) => {
    const number = i + 1;
    const known = ch !== '.';
    if (!known) estimated.push(number);
    const hole: Hole = { number, par: known ? Number(ch) : ESTIMATED_PAR };
    const index = known && si ? si[i] : undefined;
    if (typeof index === 'number' && index > 0) hole.strokeIndex = index;
    return hole;
  });
  const hasStrokeIndex = holes.length > 0 && holes.every((h) => typeof h.strokeIndex === 'number');
  return {
    id,
    name,
    holes,
    hasStrokeIndex,
    offline: true,
    estimated,
    listedPar: par || undefined,
  };
}

/** The scorecard behind an offline search hit. */
export async function fetchSnapshotCourse(id: string, signal?: AbortSignal): Promise<FetchedCourse> {
  const entries = await loadSnapshot(signal);
  const row = id.startsWith(ID_PREFIX) ? entries[Number(id.slice(ID_PREFIX.length))]?.row : undefined;
  if (!row) throw new Error(`No course ${id} in the offline course list`);
  return courseFromRow(row, id);
}
