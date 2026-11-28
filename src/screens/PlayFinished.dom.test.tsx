// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Play } from './Play';
import { makeRound, holes18, scoresFrom } from '../games/testFixtures';

/**
 * The header button on a round that is already finished.
 *
 * It used to read "Finish" and could ask "Finish the round anyway?" about a
 * round that had ended. On a finished round it now reads "Results" and goes
 * straight there, as the foot's "Back to results" does.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Holes 1–9 scored, the back nine blank — enough to trip the finish check. */
function partRound(status: Round['status']): Round {
  const hs = holes18();
  const scores = scoresFrom(hs.slice(0, 9), { p1: Array(9).fill(4), p2: Array(9).fill(5) });
  return makeRound({ holes: hs, games: ['skins'], scores, status });
}

function show(round: Round) {
  let finished = 0;
  render(
    <Play round={round} onChange={() => {}} onFinish={() => (finished += 1)} onExit={() => {}} />
  );
  return { finished: () => finished };
}

describe('Play header on a finished round', () => {
  it('reads "Results" and goes straight there, with no question asked', async () => {
    const user = userEvent.setup();
    const play = show(partRound('finished'));
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Results' }));
    expect(play.finished()).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Play header on a round in progress', () => {
  it('still reads "Finish"', () => {
    show(partRound('in_progress'));
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Results' })).toBeNull();
  });
});
