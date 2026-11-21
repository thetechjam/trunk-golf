// Course search as the screen sees it: the live service first, the offline
// course list when the live one cannot answer.

import { searchCourses, fetchCourse, type CourseHit, type FetchedCourse } from './openGolfApi';
import { loadSnapshot, searchSnapshot, fetchSnapshotCourse } from './snapshot';

export interface CourseResults {
  hits: CourseHit[];
  /** The hits came from the offline course list, not the live service. */
  offline: boolean;
}

/**
 * Search live, and fall back to the offline list when:
 *
 * - the live search fails in any way — no answer within SEARCH_TIMEOUT_MS, no
 *   network, an HTTP error. A 4xx is as useless as a 5xx to someone standing
 *   on the first tee, so the status does not matter;
 * - the live search answers with nothing. The service was seen returning
 *   empty results while it was failing, and the offline list is the same
 *   database, so an empty answer is not trusted as "no such course". The cost
 *   of being wrong is one download of the list, kept after that.
 *
 * When both come up empty the answer is "no matches". When both fail, the
 * live failure is what is thrown, because it is the one with something to
 * say ("taking too long — check your connection"). The caller's own abort
 * always wins and is rethrown as is.
 */
export async function findCourses(q: string, signal?: AbortSignal): Promise<CourseResults> {
  let failure: unknown = null;
  try {
    const hits = await searchCourses(q, signal);
    if (hits.length) return { hits, offline: false };
  } catch (err) {
    if (signal?.aborted) throw err;
    failure = err;
  }

  try {
    const hits = searchSnapshot(await loadSnapshot(signal), q);
    return { hits, offline: hits.length > 0 || failure !== null };
  } catch (err) {
    if (signal?.aborted) throw err;
    if (failure !== null) throw failure;
    // Live said "nothing" and the list could not be read: "nothing" stands.
    return { hits: [], offline: false };
  }
}

/** The full scorecard behind a hit, from wherever the hit came from. */
export function loadCourse(hit: CourseHit, signal?: AbortSignal): Promise<FetchedCourse> {
  return hit.offline ? fetchSnapshotCourse(hit.id, signal) : fetchCourse(hit.id, signal);
}
