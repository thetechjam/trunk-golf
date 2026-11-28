import { describe, it, expect } from 'vitest';
import { computeSeason, seasonYear } from './season';
import { computeStats } from './stats';
import { makeRound, player, holes, scoresFrom } from './games/testFixtures';
import { computeSettlement } from './games/settlement';
import type { Round } from './types';

/**
 * A finished nine of $5 stroke play. `cards` maps a name to the strokes over
 * 36 that player shot; the low score takes $5 from each other player.
 */
const sp = (
  id: string,
  date: string,
  cards: Record<string, number>,
  over: Partial<Round> = {}
): Round => {
  const hs = holes(9);
  const names = Object.keys(cards);
  const ids = names.map((_, i) => `${id}-p${i}`);
  const byId: Record<string, number[]> = {};
  names.forEach((n, i) => {
    byId[ids[i]] = Array(9)
      .fill(4)
      .map((v, h) => (h === 0 ? v + cards[n] : v));
  });
  return {
    ...makeRound({
      holes: hs,
      players: names.map((n, i) => player(ids[i], n)),
      scores: scoresFrom(hs, byId),
      games: ['strokePlay'],
      options: { stakes: { strokePlay: 5 } },
      status: 'finished',
    }),
    id,
    date,
    ...over,
  };
};

/** The same, with no money on it. */
const free = (id: string, date: string, cards: Record<string, number>): Round =>
  sp(id, date, cards, { options: { ...sp(id, date, cards).options, stakes: {} } });

describe('seasonYear', () => {
  const rounds = [sp('a', '2026-05-01', { Al: 0 }), sp('b', '2025-05-01', { Al: 0 })];

  it('is the year picked on the segment row', () => {
    expect(seasonYear(rounds, 2025)).toBe(2025);
  });

  it('with "All", is the latest year anything was played in', () => {
    expect(seasonYear(rounds, 'all')).toBe(2026);
    expect(seasonYear([rounds[1]], 'all')).toBe(2025);
  });

  it('with "All", skips a newer year that has only league nights or rounds with nothing on them', () => {
    const league = sp('l', '2027-01-10', { Al: 0, Bo: 2 }, {
      options: { ...sp('x', '2027-01-01', {}).options, league: { teams: [] } as never },
    });
    const friendly = free('f', '2027-01-12', { Al: 0, Bo: 2 });
    const money = sp('m', '2026-09-01', { Al: 0, Bo: 2 });
    expect(seasonYear([friendly, league, money], 'all')).toBe(2026);
    // Picked on the segment row, the year is still the one picked.
    expect(seasonYear([friendly, league, money], 2027)).toBe(2027);
    // No money anywhere: the latest year, as before.
    expect(seasonYear([friendly, league], 'all')).toBe(2027);
  });

  it('is null with no rounds', () => {
    expect(seasonYear([], 'all')).toBeNull();
  });
});

describe('computeSeason', () => {
  it("nets agree with computeStats' money for the same rounds", () => {
    const rounds = [
      sp('a', '2026-06-01', { Tom: 0, Dave: 2, Mike: 4 }),
      sp('b', '2026-05-01', { Tom: 3, Dave: 0, Mike: 1 }),
      sp('c', '2026-04-01', { Tom: 0, Mike: 2 }),
    ];
    const season = computeSeason(rounds, 2026);
    const stats = computeStats(rounds);
    for (const p of season.players) {
      expect(p.money).toBe(stats.players.find((q) => q.key === p.key)?.money);
    }
    expect(season.players.map((p) => [p.name, p.money, p.rounds])).toEqual([
      ['Tom', 10, 3],
      ['Dave', 5, 2],
      ['Mike', -15, 3],
    ]);
    expect(season.rounds).toBe(3);
    expect(season.moneyRounds).toBe(3);
    expect(season.leagueNights).toBe(0);
  });

  it('leaves out other years, league nights, scrambles and abandoned rounds', () => {
    const league = sp('l', '2026-06-02', { Tom: 9, Mike: 0 }, {
      options: { ...sp('x', '2026-01-01', {}).options, league: { teams: [] } as never },
    });
    const scramble = sp('s', '2026-06-03', { Tom: 9, Mike: 0 }, {
      options: { ...sp('x', '2026-01-01', {}).options, scramble: { teams: [] } as never },
    });
    const abandoned = {
      ...sp('u', '2026-06-04', { Tom: 9, Mike: 0 }),
      status: 'in_progress' as const,
      scores: {},
    };
    const rounds = [
      league,
      scramble,
      abandoned,
      sp('a', '2026-06-01', { Tom: 0, Mike: 1 }),
      sp('old', '2025-06-01', { Tom: 9, Mike: 0 }),
    ];
    // The screen's population: counted rounds only.
    const counted = rounds.filter((r) => r.status === 'finished');
    const season = computeSeason(counted, 2026);
    expect(season.rounds).toBe(1);
    expect(season.moneyRounds).toBe(1);
    expect(season.players.map((p) => [p.name, p.money])).toEqual([
      ['Tom', 5],
      ['Mike', -5],
    ]);
    expect(computeSeason(counted, 2025).players.map((p) => p.money)).toEqual([5, -5]);
    // Counted for the year's league nights, so the card can say they are out.
    expect(season.leagueNights).toBe(1);
    expect(computeSeason(counted, 2025).leagueNights).toBe(0);
  });

  it('matches names however they were typed, and shows the latest spelling', () => {
    const season = computeSeason(
      [sp('a', '2026-06-01', { tom: 0, Mike: 1 }), sp('b', '2026-05-01', { 'TOM ': 0, Mike: 1 })],
      2026
    );
    expect(season.players.map((p) => [p.name, p.money, p.rounds])).toEqual([
      ['tom', 10, 2],
      ['Mike', -10, 2],
    ]);
  });

  it('gives a player with no money rounds no figure rather than $0', () => {
    const season = computeSeason(
      [sp('a', '2026-06-01', { Tom: 0, Mike: 1 }), free('b', '2026-05-01', { Tom: 0, Zed: 1 })],
      2026
    );
    expect(season.players.find((p) => p.name === 'Zed')).toMatchObject({
      money: null,
      moneyRounds: 0,
      rounds: 1,
    });
    // Sorted last, below the money figures.
    expect(season.players[season.players.length - 1].name).toBe('Zed');
    expect(season.moneyRounds).toBe(1);
  });

  it('has no money rounds when nothing was played for money', () => {
    const season = computeSeason([free('a', '2026-06-01', { Tom: 0, Mike: 1 })], 2026);
    expect(season.moneyRounds).toBe(0);
    expect(season.pairs).toEqual([]);
  });

  it('takes the head to head from the four who played for money most', () => {
    const rounds = [
      sp('a', '2026-06-01', { A: 0, B: 1, C: 2, D: 3 }),
      sp('b', '2026-06-02', { A: 0, B: 1, C: 2, D: 3 }),
      sp('c', '2026-06-03', { A: 0, B: 1, C: 2, E: 3 }),
    ];
    const season = computeSeason(rounds, 2026);
    const inPairs = new Set(season.pairs.flatMap((p) => [p.a, p.b]));
    expect([...inPairs].sort()).toEqual(['A', 'B', 'C', 'D']);
    // Four players, six pairs.
    expect(season.pairs).toHaveLength(6);
  });

  it('records who finished ahead, leader first, with each net in the shared rounds', () => {
    const rounds = [
      sp('a', '2026-06-01', { Mike: 0, Tom: 1 }),
      sp('b', '2026-06-02', { Mike: 1, Tom: 0 }),
      sp('c', '2026-06-03', { Mike: 2, Tom: 0 }),
      sp('d', '2026-06-04', { Mike: 0, Tom: 0 }),
      // Tom on his own with someone else: not a round with Mike.
      sp('e', '2026-06-05', { Tom: 0, Zed: 1 }),
    ];
    const [pair] = computeSeason(rounds, 2026).pairs.filter(
      (p) => [p.a, p.b].sort().join() === 'Mike,Tom'
    );
    expect(pair).toEqual({
      a: 'Tom',
      b: 'Mike',
      shared: 4,
      aWins: 2,
      bWins: 1,
      even: 1,
      aNet: 5,
      bNet: -5,
    });
  });

  it('puts the pair with the most rounds together first', () => {
    const rounds = [
      sp('a', '2026-06-01', { A: 0, B: 1, C: 2 }),
      sp('b', '2026-06-02', { A: 0, B: 1 }),
    ];
    const pairs = computeSeason(rounds, 2026).pairs;
    expect(pairs[0]).toMatchObject({ a: 'A', b: 'B', shared: 2 });
    expect(pairs.slice(1).every((p) => p.shared === 1)).toBe(true);
  });

  it('adds in whole cents, so a three-way split does not drift', () => {
    // Three tie for low and split the loser's $5: 1.67 / 1.67 / 1.66 a round.
    const rounds = ['a', 'b', 'c'].map((id, i) =>
      sp(id, `2026-06-0${i + 1}`, { A: 0, B: 0, C: 0, D: 5 })
    );
    const one = computeSettlement(rounds[0]).totals;
    expect(Object.values(one).reduce((s, v) => s + v, 0)).toBeCloseTo(0, 10);
    const season = computeSeason(rounds, 2026);
    const total = season.players.reduce((s, p) => s + (p.money ?? 0), 0);
    expect(Math.round(total * 100)).toBe(0);
    expect(season.players.find((p) => p.name === 'D')?.money).toBe(-15);
    for (const p of season.players) expect(p.money).toBe(Number((p.money ?? 0).toFixed(2)));
    for (const pr of season.pairs) {
      // Exactly a cent figure, not 4.9799999…
      expect(pr.aNet).toBe(Number(pr.aNet.toFixed(2)));
      expect(pr.bNet).toBe(Number(pr.bNet.toFixed(2)));
    }
  });
});
