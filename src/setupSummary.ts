import type { Hole, GameType, Stakes } from './types';
import { gameMeta } from './games';

/**
 * One-line summaries for the collapsed rows on New Round.
 *
 * These carry real weight: a row showing "18 holes · par 72" tells a
 * first-time user the question is already answered, which is what makes
 * skipping it feel safe rather than negligent. Every function therefore
 * returns a meaningful string for the empty case — never ''.
 */

export function courseSummary(course: string): string {
  const name = course.trim();
  return name || 'Not set';
}

export function holesSummary(holes: Hole[]): string {
  if (holes.length === 0) return 'No holes';
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  return `${holes.length} holes · par ${par}`;
}

export function gamesSummary(games: GameType[]): string {
  if (games.length === 0) return 'No games';
  return games.map((g) => gameMeta(g).label).join(', ');
}

/** `$5` for whole dollars, `$2.50` otherwise. */
function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function stakesSummary(games: GameType[], stakes: Stakes): string {
  // Driven by `games`, not by the keys of `stakes`: deselecting a game leaves
  // its stake behind in options.stakes, and that money is not in play.
  const staked = games
    .filter((g) => (stakes?.[g] ?? 0) > 0)
    .map((g) => `${money(stakes[g] as number)} ${gameMeta(g).label}`);

  return staked.length === 0 ? 'No stakes' : staked.join(' · ');
}

/**
 * Summary for the League screen's collapsed pars/stroke-index row.
 *
 * Shows par always, and calls out an incomplete stroke index only when there
 * is one. League nights allocate handicap strokes down the stroke index, so a
 * hole missing its index changes how the match scores — that is worth saying
 * out loud from a collapsed row. The complete case stays silent: league holes
 * are seeded with an index by default, so saying so would be noise on almost
 * every round and would train the eye to skip the line that matters.
 *
 * The hole count is deliberately omitted — a league nine is always nine.
 */
export function leagueCourseSummary(holes: Hole[]): string {
  if (holes.length === 0) return 'No holes';
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  const missingSI = holes.some((h) => h.strokeIndex == null);
  // Just "gaps". The row's label already names what has them, and the header
  // gives this ~110px beside a 143px label — "SI gaps" and "incomplete" both
  // truncated mid-word, losing the one thing the line exists to say. A summary
  // that does not fit is not a shorter summary, it is a wrong one.
  return missingSI ? `Par ${par} · gaps` : `Par ${par}`;
}

/**
 * One selected game that uses handicaps, as the Handicap options rows show
 * it: whether it can be played gross, whether it is net, and its effective
 * allowance (the stored one, or the fallback when none is stored).
 */
export interface HandicapRow {
  canNet: boolean;
  net: boolean;
  allowance: number;
  fallback: number;
}

/**
 * Summary for the closed Handicap options disclosure.
 *
 * Worked from effective values, so a remembered allowance equal to its
 * fallback, or one stored for a game not in play, still reads as default.
 * Kept short on purpose: it sits under the label at 320px.
 */
export function handicapSummary(rows: HandicapRow[]): string {
  // A game that cannot be played gross (Quota) always uses handicaps.
  const usesHcp = (r: HandicapRow) => !r.canNet || r.net;
  if (rows.every(usesHcp)) {
    if (rows.every((r) => r.allowance === 100)) return 'Net · full allowance';
    if (rows.every((r) => r.allowance === r.fallback) && rows.some((r) => r.fallback === 90)) {
      return 'Net · 90% four-ball';
    }
    return 'Custom';
  }
  if (rows.every((r) => !usesHcp(r))) return 'Gross';
  return 'Custom';
}

/** "A", "A or B", "A, B or C". */
function orList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * A gentle line under the game tiles when a selected game has no stake, or
 * null when there is nothing to say (no games, or every game staked). Never a
 * blocker: a round started at $0 plays exactly as it always has. 0 reads as
 * unstaked, since a cleared stake field stores 0.
 */
export function stakesPrompt(games: GameType[], stakes: Stakes): string | null {
  const unstaked = games.filter((g) => !((stakes?.[g] ?? 0) > 0));
  if (unstaked.length === 0) return null;
  if (unstaked.length === games.length) {
    return 'No stakes yet — add a $ amount to track who owes what.';
  }
  const names = orList(unstaked.map((g) => gameMeta(g).label));
  const pronoun = unstaked.length === 1 ? 'it' : 'they';
  return `No stake on ${names} yet — ${pronoun} won’t count toward the money.`;
}
