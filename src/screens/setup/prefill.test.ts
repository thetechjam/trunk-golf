import { describe, it, expect } from 'vitest';
import type { GameOptions, Round } from '../../types';
import { realCard18 } from '../../games/testFixtures';
import { lastCourseRound, seedFrom } from './prefill';

const options = (patch: Partial<GameOptions> = {}): GameOptions => ({
  useNet: false,
  stablefordMode: 'standard',
  loneWolfMultiplier: 2,
  blindWolfMultiplier: 3,
  stakes: {},
  ...patch,
});

const round = (patch: Partial<Round> = {}): Round => ({
  id: 'r',
  course: 'Sunset Ridge',
  date: '2026-09-01',
  createdAt: 1,
  updatedAt: 1,
  players: [
    { id: 'p1', name: 'Mike', handicap: 8 },
    { id: 'p2', name: 'Dave', index: 12.4 },
    { id: 'p3', name: 'Chris' },
    { id: 'p4', name: 'Tom', handicap: 3, index: 2.1 },
  ],
  holes: realCard18(),
  games: ['nassau', 'skins'],
  options: options(),
  scores: {},
  wolf: {},
  status: 'finished',
  ...patch,
});

describe('lastCourseRound', () => {
  it('is the newest regular round, skipping league nights and scrambles', () => {
    const regular = round({ id: 'reg' });
    const rounds = [
      round({ id: 'lg', course: 'League CC', options: options({ league: { teams: [] } as never }) }),
      round({ id: 'sc', course: 'Scramble CC', options: options({ scramble: { teams: [] } as never }) }),
      regular,
    ];
    expect(lastCourseRound(rounds)).toBe(regular);
  });

  it('is null when the latest regular round has no course name, or there are none', () => {
    expect(lastCourseRound([round({ course: '  ' }), round({ id: 'older' })])).toBeNull();
    expect(lastCourseRound([round({ course: undefined })])).toBeNull();
    expect(lastCourseRound([])).toBeNull();
  });
});

describe('seedFrom', () => {
  const ids = () => {
    let n = 0;
    return () => `new${++n}`;
  };

  it('keeps the players in order with their handicaps and Indexes, under new ids', () => {
    const { players } = seedFrom(round(), ids());
    expect(players).toEqual([
      { id: 'new1', name: 'Mike', handicap: 8 },
      { id: 'new2', name: 'Dave', index: 12.4 },
      { id: 'new3', name: 'Chris' },
      { id: 'new4', name: 'Tom', handicap: 3, index: 2.1 },
    ]);
  });

  it('mints fresh ids by default', () => {
    const r = round();
    const { players } = seedFrom(r);
    const old = new Set(r.players.map((p) => p.id));
    expect(players.every((p) => !old.has(p.id))).toBe(true);
    expect(new Set(players.map((p) => p.id)).size).toBe(4);
  });

  it('maps 2v2 teams onto the new ids, everyone placed explicitly', () => {
    const r = round({
      players: [...round().players, { id: 'p5', name: 'Sam' }],
      options: options({
        nassau: { mode: '2v2', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] },
        vegas: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
      }),
    });
    const seed = seedFrom(r, ids());
    expect(seed.nassau.assign).toEqual({ new1: 'A', new2: 'B', new3: 'A', new4: 'B', new5: '-' });
    expect(seed.vegasAssign).toEqual({ new1: 'A', new2: 'B', new3: 'B', new4: 'A', new5: '-' });
    expect(seed.match).toEqual({ sideA: '', sideB: '', assign: {} });
  });

  it('maps 1v1 sides onto the new ids', () => {
    const seed = seedFrom(
      round({ options: options({ matchPlay: { mode: '1v1', teamA: ['p4'], teamB: ['p2'] } }) }),
      ids()
    );
    expect(seed.match).toEqual({ sideA: 'new4', sideB: 'new2', assign: {} });
  });

  it('drops a team that names someone not on the card', () => {
    const seed = seedFrom(
      round({
        options: options({
          nassau: { mode: '2v2', teamA: ['p1', 'gone'], teamB: ['p2', 'p4'] },
          matchPlay: { mode: '1v1', teamA: ['p1'], teamB: ['gone'] },
        }),
      }),
      ids()
    );
    expect(seed.nassau).toEqual({ sideA: '', sideB: '', assign: {} });
    expect(seed.match).toEqual({ sideA: '', sideB: '', assign: {} });
  });

  it('leaves out a blank player', () => {
    const seed = seedFrom(round({ players: [{ id: 'p1', name: 'Mike' }, { id: 'p2', name: ' ' }] }), ids());
    expect(seed.players.map((p) => p.name)).toEqual(['Mike']);
  });
});
