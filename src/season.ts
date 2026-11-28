import type { Round } from './types';
import { computeStats } from './stats';
import { tripLedger } from './trips';
import { filterByYear, roundYears } from './history';
import { nameKey } from './people';
import { isScramble } from './games/scramble';

/**
 * "This season" on the Stats screen: the year's money, by player and between
 * the regular crew.
 *
 * A season is a calendar year — the same years the segment row above offers,
 * and the same season a league runs on. Nothing is stored; it is read from the
 * rounds `Stats` already counts.
 *
 * League nights and scrambles are not in it. A league night settles on points,
 * and a scramble's players are teams nobody can be matched to by name — the
 * same two exclusions the trip ledger makes, for the same reasons.
 */

export interface SeasonPlayer {
  name: string;
  key: string;
  /** Rounds played this year (scored in, not merely listed). */
  rounds: number;
  /** Rounds this year that had money on them. */
  moneyRounds: number;
  /** Net dollars over those rounds; `null` when there were none. */
  money: number | null;
}

export interface SeasonPair {
  /** The pair, leader first. */
  a: string;
  b: string;
  /** Money rounds both played. */
  shared: number;
  /** Of those, how many each finished ahead in, and how many were level. */
  aWins: number;
  bWins: number;
  even: number;
  /** Each player's own net over the shared rounds. */
  aNet: number;
  bNet: number;
}

export interface Season {
  year: number;
  /** Regular rounds counted this year. */
  rounds: number;
  /** Of those, the ones with a stake on them. */
  moneyRounds: number;
  /**
   * League nights counted for stats this year but left out of the season, so
   * the card can say why its round counts are lower than the player cards'.
   */
  leagueNights: number;
  /** Biggest net first. */
  players: SeasonPlayer[];
  /** Most shared rounds first. */
  pairs: SeasonPair[];
}

/** The most players the head-to-head covers: a four-ball's worth of pairs. */
const CREW = 4;

const regular = (r: Round) => !r.options.league && !isScramble(r);

/**
 * The year to show: the one picked on the segment row, or with "All" the
 * latest year with a regular round played for money — so a January league
 * night, or a friendly with nothing on it, does not hide last year's season
 * before this year's first money round. Without one, the latest year
 * anything was played in (the card then has nothing to show). `null` when
 * there are no rounds.
 */
export function seasonYear(counted: Round[], pick: number | 'all'): number | null {
  if (pick !== 'all') return pick;
  const years = roundYears(counted);
  const withMoney = years.find(
    (y) => tripLedger(filterByYear(counted, y).filter(regular)).moneyRounds > 0
  );
  return withMoney ?? years[0] ?? null;
}

/**
 * The season's figures. `counted` is the Stats screen's population — rounds
 * that count for stats, newest first.
 */
export function computeSeason(counted: Round[], year: number): Season {
  const inYear = filterByYear(counted, year);
  const rounds = inYear.filter(regular);
  const leagueNights = inYear.filter((r) => !!r.options.league).length;
  const stats = computeStats(rounds);
  const ledger = tripLedger(rounds);

  // Whole cents per player per round, so a three-way split of $5 adds back up
  // to what was won rather than to a fraction of a cent off it.
  const centsByKey = new Map<string, Map<string, number>>();
  for (const p of ledger.players) {
    const byRound = new Map<string, number>();
    for (const [id, dollars] of Object.entries(p.byRound)) byRound.set(id, Math.round(dollars * 100));
    centsByKey.set(nameKey(p.name), byRound);
  }
  const totalCents = (key: string, only?: Set<string>) => {
    let sum = 0;
    for (const [id, c] of centsByKey.get(key) ?? []) if (!only || only.has(id)) sum += c;
    return sum;
  };

  // Only rounds the player actually scored in — `computeStats`' test — so a
  // no-show still listed on a card is not a round "together".
  const playedBy = new Map<string, Set<string>>();
  for (const r of rounds) {
    for (const p of r.players) {
      if (!r.holes.some((h) => r.scores[h.number]?.[p.id] != null)) continue;
      const key = nameKey(p.name);
      if (!key) continue;
      const set = playedBy.get(key) ?? new Set<string>();
      set.add(r.id);
      playedBy.set(key, set);
    }
  }

  const players: SeasonPlayer[] = stats.players
    .map((p) => ({
      name: p.name,
      key: p.key,
      rounds: p.rounds,
      moneyRounds: p.moneyRounds,
      money: p.moneyRounds > 0 ? totalCents(p.key, playedBy.get(p.key)) / 100 : null,
    }))
    .sort(
      (a, b) =>
        (b.money ?? -Infinity) - (a.money ?? -Infinity) || a.name.localeCompare(b.name)
    );

  // The regular crew: whoever played for money most this year.
  const crew = players
    .filter((p) => p.moneyRounds > 0)
    .sort(
      (a, b) =>
        b.moneyRounds - a.moneyRounds || b.rounds - a.rounds || a.name.localeCompare(b.name)
    )
    .slice(0, CREW);

  const pairs: SeasonPair[] = [];
  for (let i = 0; i < crew.length; i++) {
    for (let j = i + 1; j < crew.length; j++) {
      let [x, y] = [crew[i], crew[j]];
      const xMoney = centsByKey.get(x.key) ?? new Map<string, number>();
      const yMoney = centsByKey.get(y.key) ?? new Map<string, number>();
      const shared = new Set(
        [...xMoney.keys()].filter(
          (id) => yMoney.has(id) && playedBy.get(x.key)?.has(id) && playedBy.get(y.key)?.has(id)
        )
      );
      if (shared.size === 0) continue;
      let xWins = 0;
      let yWins = 0;
      for (const id of shared) {
        const d = (xMoney.get(id) ?? 0) - (yMoney.get(id) ?? 0);
        if (d > 0) xWins += 1;
        else if (d < 0) yWins += 1;
      }
      let xNet = totalCents(x.key, shared);
      let yNet = totalCents(y.key, shared);
      // Leader first: more rounds won, then more money in them, then by name.
      const swap =
        yWins > xWins ||
        (yWins === xWins && (yNet > xNet || (yNet === xNet && y.name.localeCompare(x.name) < 0)));
      if (swap) {
        [x, y] = [y, x];
        [xWins, yWins] = [yWins, xWins];
        [xNet, yNet] = [yNet, xNet];
      }
      pairs.push({
        a: x.name,
        b: y.name,
        shared: shared.size,
        aWins: xWins,
        bWins: yWins,
        even: shared.size - xWins - yWins,
        aNet: xNet / 100,
        bNet: yNet / 100,
      });
    }
  }
  pairs.sort((p, q) => q.shared - p.shared || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));

  return { year, rounds: stats.rounds, moneyRounds: ledger.moneyRounds, leagueNights, players, pairs };
}
