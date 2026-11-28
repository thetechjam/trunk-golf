import { describe, it, expect } from 'vitest';
import {
  courseSummary,
  holesSummary,
  gamesSummary,
  stakesSummary,
  leagueCourseSummary,
  handicapSummary,
  stakesPrompt,
  type HandicapRow,
} from './setupSummary';
import { holes, holes18 } from './games/testFixtures';

describe('courseSummary', () => {
  it('names the course when set', () => {
    expect(courseSummary('Prairie Landing')).toBe('Prairie Landing');
  });

  it('trims before deciding whether it is set', () => {
    expect(courseSummary('   ')).toBe('Not set');
    expect(courseSummary('  Prairie Landing ')).toBe('Prairie Landing');
  });

  it('says Not set when empty', () => {
    expect(courseSummary('')).toBe('Not set');
  });
});

describe('holesSummary', () => {
  it('counts holes and totals par', () => {
    expect(holesSummary(holes18())).toBe('18 holes · par 72');
  });

  it('handles a nine', () => {
    expect(holesSummary(holes(9))).toBe('9 holes · par 36');
  });

  it('reports no holes rather than an empty string', () => {
    expect(holesSummary([])).toBe('No holes');
  });
});

describe('gamesSummary', () => {
  it('names a single game', () => {
    expect(gamesSummary(['skins'])).toBe('Skins');
  });

  it('joins several in selection order', () => {
    expect(gamesSummary(['skins', 'wolf'])).toBe('Skins, Wolf');
  });

  it('says No games when none are selected', () => {
    expect(gamesSummary([])).toBe('No games');
  });
});

describe('stakesSummary', () => {
  it('says No stakes when nothing is staked', () => {
    expect(stakesSummary(['skins'], {})).toBe('No stakes');
  });

  it('treats a zero stake as unstaked', () => {
    // StakesEditor writes 0 when a field is cleared, so 0 and absent must read
    // the same or a cleared field would keep claiming money is on the line.
    expect(stakesSummary(['skins'], { skins: 0 })).toBe('No stakes');
  });

  it('lists staked games with their amounts', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5, wolf: 2 })).toBe(
      '$5 Skins · $2 Wolf'
    );
  });

  it('lists only staked games, skipping the rest', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5 })).toBe('$5 Skins');
  });

  it('ignores stakes for games no longer selected', () => {
    // Deselecting a game leaves its stake behind in options.stakes.
    expect(stakesSummary(['skins'], { skins: 5, wolf: 99 })).toBe('$5 Skins');
  });

  it('keeps a decimal stake readable', () => {
    expect(stakesSummary(['skins'], { skins: 2.5 })).toBe('$2.50 Skins');
  });
});

describe('leagueCourseSummary', () => {
  const nine = (overrides: Partial<Record<number, Partial<{ par: number; strokeIndex?: number }>>> = {}) =>
    Array.from({ length: 9 }, (_, i) => ({
      number: i + 1,
      par: 4,
      strokeIndex: i + 1,
      ...(overrides[i + 1] ?? {}),
    }));

  it('shows par and stays silent when every hole has a stroke index', () => {
    // League holes are seeded with an index, so the complete case is the norm;
    // saying "SI set" every round would train the eye to skip the line.
    expect(leagueCourseSummary(nine())).toBe('Par 36');
  });

  it('flags an incomplete stroke index, which changes how strokes fall', () => {
    expect(leagueCourseSummary(nine({ 4: { strokeIndex: undefined } }))).toBe('Par 36 · gaps');
  });

  it('keeps the summary short enough to survive the row header', () => {
    // Measured at 375px: the label takes 143px of a 309px header, leaving the
    // summary ~110px. Both "SI gaps" and "incomplete" overran it and truncated
    // mid-word. 14 characters is what actually fits.
    expect(leagueCourseSummary(nine({ 4: { strokeIndex: undefined } })).length).toBeLessThanOrEqual(14);
  });

  it('does not repeat the noun its row label already carries', () => {
    expect(leagueCourseSummary(nine({ 4: { strokeIndex: undefined } }))).not.toMatch(/stroke|SI/i);
  });

  it('totals real pars rather than assuming all fours', () => {
    expect(leagueCourseSummary(nine({ 3: { par: 3 }, 8: { par: 5 } }))).toBe('Par 36');
    expect(leagueCourseSummary(nine({ 3: { par: 3 } }))).toBe('Par 35');
  });

  it('omits the hole count, since a league nine is always nine', () => {
    expect(leagueCourseSummary(nine())).not.toMatch(/hole/i);
  });

  it('reports no holes rather than an empty string', () => {
    expect(leagueCourseSummary([])).toBe('No holes');
  });
});

describe('handicapSummary', () => {
  const net = (allowance = 100, fallback = 100): HandicapRow => ({ canNet: true, net: true, allowance, fallback });
  const gross = (): HandicapRow => ({ canNet: true, net: false, allowance: 100, fallback: 100 });
  const quota = (): HandicapRow => ({ canNet: false, net: false, allowance: 100, fallback: 100 });

  it('reads full allowance when every game is net at 100', () => {
    expect(handicapSummary([net(), net()])).toBe('Net · full allowance');
    expect(handicapSummary([quota(), net()])).toBe('Net · full allowance');
  });

  it('names the four-ball 90% when a game sits at that fallback', () => {
    expect(handicapSummary([net(90, 90), net()])).toBe('Net · 90% four-ball');
  });

  it('reads Gross when every net-capable game is gross', () => {
    expect(handicapSummary([gross(), gross()])).toBe('Gross');
  });

  it('is Custom when Quota sits beside a gross game', () => {
    // Quota always uses handicaps, so the round is not "Gross".
    expect(handicapSummary([quota(), gross()])).toBe('Custom');
  });

  it('is Custom for a mix of gross and net', () => {
    expect(handicapSummary([net(), gross()])).toBe('Custom');
  });

  it('is Custom when an allowance is moved off its fallback', () => {
    expect(handicapSummary([net(85, 100)])).toBe('Custom');
    expect(handicapSummary([net(85, 90)])).toBe('Custom');
  });

  it('reads as the default with no rows', () => {
    expect(handicapSummary([])).toBe('Net · full allowance');
  });
});

describe('stakesPrompt', () => {
  it('says nothing with no games selected', () => {
    expect(stakesPrompt([], {})).toBeNull();
  });

  it('invites a stake when no game has one', () => {
    expect(stakesPrompt(['skins', 'wolf'], {})).toBe(
      'No stakes yet — add a $ amount to track who owes what.'
    );
  });

  it('treats a zero stake as unstaked', () => {
    expect(stakesPrompt(['skins'], { skins: 0 })).toBe(
      'No stakes yet — add a $ amount to track who owes what.'
    );
  });

  it('says nothing once every game is staked', () => {
    expect(stakesPrompt(['skins', 'wolf'], { skins: 5, wolf: 1 })).toBeNull();
  });

  it('names one unstaked game among staked ones', () => {
    expect(stakesPrompt(['skins', 'wolf'], { skins: 5 })).toBe(
      'No stake on Wolf yet — it won’t count toward the money.'
    );
  });

  it('names two unstaked games', () => {
    expect(stakesPrompt(['nassau', 'skins', 'junk'], { nassau: 5 })).toBe(
      'No stake on Skins or Junk yet — they won’t count toward the money.'
    );
  });

  it('names three unstaked games', () => {
    expect(stakesPrompt(['nassau', 'skins', 'wolf', 'junk'], { nassau: 5, wolf: 0 })).toBe(
      'No stake on Skins, Wolf or Junk yet — they won’t count toward the money.'
    );
  });

  it('ignores a stake left on an unselected game', () => {
    expect(stakesPrompt(['skins'], { wolf: 5 })).toBe(
      'No stakes yet — add a $ amount to track who owes what.'
    );
  });
});
