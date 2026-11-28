import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { playAgainLines, playAgainRound } from './playAgain';
import { makeRound, player, scrambleRound } from './games/testFixtures';

const NOW = Date.UTC(2026, 8, 22, 18);
const HOUR = 60 * 60 * 1000;

const four = [player('p1', 'Mike Smith'), player('p2', 'Dave'), player('p3', 'Chris'), player('p4', 'Tom')];

const done = (id: string, over: Partial<Round> = {}): Round => ({
  ...makeRound({ players: four, games: ['nassau', 'skins'], status: 'finished' }),
  id,
  updatedAt: NOW - 48 * HOUR,
  ...over,
});

const league = (id: string): Round => {
  const r = done(id);
  return {
    ...r,
    options: {
      ...r.options,
      league: {
        teams: [
          { aId: 'p1', bId: 'p2' },
          { aId: 'p3', bId: 'p4' },
        ],
        pointsPerMatch: 1,
      },
    },
  };
};

describe('playAgainRound', () => {
  it('offers the newest finished everyday round', () => {
    expect(playAgainRound([done('a'), done('b')], NOW)?.id).toBe('a');
  });

  it('skips league nights, scrambles, unfinished rounds and rounds with no games', () => {
    const scramble = { ...scrambleRound({}), id: 's', status: 'finished' as const, updatedAt: 0 };
    const stale = done('u', { status: 'in_progress', updatedAt: NOW - 30 * HOUR });
    const noGames = done('n', { games: [] });
    const unnamed = done('x', { players: [player('p1', ' '), player('p2', '')] });
    expect(playAgainRound([league('l'), scramble, stale, noGames, unnamed, done('ok')], NOW)?.id).toBe(
      'ok'
    );
  });

  it('is null with nothing to play again', () => {
    expect(playAgainRound([], NOW)).toBeNull();
    expect(playAgainRound([league('l')], NOW)).toBeNull();
  });

  it('stands aside while a round is live', () => {
    const live = done('live', { status: 'in_progress', updatedAt: NOW - HOUR });
    expect(playAgainRound([live, done('a')], NOW)).toBeNull();
  });

  it('is not held back by a card abandoned days ago', () => {
    const stale = done('stale', { status: 'in_progress', updatedAt: NOW - 25 * HOUR });
    expect(playAgainRound([stale, done('a')], NOW)?.id).toBe('a');
  });
});

describe('playAgainLines', () => {
  it('reads course and crew, then the stakes', () => {
    const r = done('a', { course: 'Sunset Ridge' });
    r.options.stakes = { nassau: 5, skins: 2 };
    expect(playAgainLines(r)).toEqual({
      who: 'Sunset Ridge · Mike, Dave, Chris & Tom',
      games: '$5 Nassau · $2 Skins',
    });
  });

  it('names the games when nothing rides on them', () => {
    expect(playAgainLines(done('a'))).toEqual({ who: 'Mike, Dave, Chris & Tom', games: 'Nassau, Skins' });
  });

  it('lists only the staked games, and ignores a stake left on a dropped game', () => {
    const r = done('a', { games: ['nassau', 'skins'] });
    r.options.stakes = { skins: 2.5, wolf: 10 };
    expect(playAgainLines(r).games).toBe('$2.50 Skins');
  });

  it('reads two players as a pair', () => {
    const r = done('a', { players: [player('p1', 'Mike'), player('p2', 'Dave')], course: 'Delcastle' });
    expect(playAgainLines(r).who).toBe('Delcastle · Mike & Dave');
  });
});
