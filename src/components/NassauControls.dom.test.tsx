// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { NassauControls } from './NassauControls';
import { makeRound, holes, holes18 } from '../games/testFixtures';

/**
 * The one line under the Press button that says what a press is.
 *
 * It shows until the round has its first press — derived from the round, with
 * nothing stored — so a group new to the word sees it, and a group that has
 * pressed stops being told.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NINE_NOTE = 'A press is a new bet on the holes left in this nine, for the same stake.';
const LEFT_NOTE = 'A press is a new bet on the holes left, for the same stake.';

/** Holds presses in state, as Play does, so a tap re-renders the panel. */
function Harness({ initial }: { initial: Round }) {
  const [round, setRound] = useState(initial);
  return (
    <NassauControls
      round={round}
      hole={round.holes[2]}
      onChange={(presses) => setRound({ ...round, presses })}
    />
  );
}

async function openPanel(round: Round) {
  const user = userEvent.setup();
  render(<Harness initial={round} />);
  await user.click(document.querySelector('.nassau.collapsed')!);
  return user;
}

describe('NassauControls press note', () => {
  it('explains a press on a fresh 18-hole round', async () => {
    await openPanel(makeRound({ holes: holes18(), games: ['nassau'] }));
    expect(screen.getByText(NINE_NOTE)).toBeTruthy();
  });

  it('goes away once the group presses', async () => {
    const user = await openPanel(makeRound({ holes: holes18(), games: ['nassau'] }));
    await user.click(screen.getByRole('button', { name: /^Press — new bet on holes 3–9$/ }));
    expect(screen.queryByText(NINE_NOTE)).toBeNull();
    expect(screen.getByText('✓ Press added')).toBeTruthy();
  });

  it('is not shown on a round that already has a press', async () => {
    await openPanel(makeRound({ holes: holes18(), games: ['nassau'], presses: [2] }));
    expect(screen.queryByText(NINE_NOTE)).toBeNull();
    expect(screen.queryByText(LEFT_NOTE)).toBeNull();
  });

  it('says "the holes left" on a nine-hole round', async () => {
    await openPanel(makeRound({ holes: holes(9), games: ['nassau'] }));
    expect(screen.getByText(LEFT_NOTE)).toBeTruthy();
    expect(screen.queryByText(NINE_NOTE)).toBeNull();
  });
});
