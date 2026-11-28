// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Round } from '../types';
import { Home } from './Home';
import { saveRounds, saveSettings } from '../storage';
import { makeRound, player, scrambleRound } from '../games/testFixtures';

/**
 * Home's Play again card: last round's course, crew and games, offered under
 * the launcher tiles when nothing is being played.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const noop = () => {};
const renderHome = (onPlayAgain?: (r: Round) => void) =>
  render(
    <Home
      onNew={noop}
      onNewLeague={noop}
      onNewScramble={noop}
      onResume={noop}
      onViewResults={noop}
      onStats={noop}
      onHistory={noop}
      onPlayAgain={onPlayAgain}
    />
  );

const finished = (id: string, over: Partial<Round> = {}): Round => ({
  ...makeRound({
    players: [player('p1', 'Mike'), player('p2', 'Dave'), player('p3', 'Chris'), player('p4', 'Tom')],
    games: ['nassau', 'skins'],
    options: { stakes: { nassau: 5, skins: 2 } },
    status: 'finished',
  }),
  id,
  course: 'Sunset Ridge',
  date: '2026-07-01',
  createdAt: 5,
  updatedAt: 5,
  ...over,
});

const card = () => screen.queryByRole('button', { name: /^Play again/ });
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Home: Play again', () => {
  it('offers the last round under the action tiles, and hands it over when tapped', () => {
    const r = finished('a');
    saveRounds([r, finished('b', { course: 'Elsewhere' })]);
    const onPlayAgain = vi.fn();
    const { container } = renderHome(onPlayAgain);

    const button = card()!;
    expect(button.textContent).toContain('Sunset Ridge · Mike, Dave, Chris & Tom');
    expect(button.textContent).toContain('$5 Nassau · $2 Skins');
    expect(follows(container.querySelector('.home-actions')!, button)).toBe(true);

    fireEvent.click(button);
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onPlayAgain.mock.calls[0][0].id).toBe('a');
  });

  it('keeps Start New Round as the one filled button', () => {
    saveRounds([finished('a')]);
    renderHome(noop);
    expect(screen.getByRole('button', { name: 'Start New Round' }).className).toContain('btn-primary');
    expect(card()!.className).not.toContain('btn-primary');
  });

  it('comes before the backup reminder when both are due', () => {
    saveRounds(['a', 'b', 'c'].map((id) => finished(id)));
    saveSettings({ firstFinishPromptDismissed: true });
    renderHome(noop);
    const reminder = screen.getByRole('heading', { name: '3 rounds aren’t backed up' });
    expect(follows(card()!, reminder)).toBe(true);
  });

  it('is absent with no rounds', () => {
    renderHome(noop);
    expect(card()).toBeNull();
  });

  it('is absent with only league nights and scrambles behind it', () => {
    const base = finished('l');
    const league: Round = {
      ...base,
      options: {
        ...base.options,
        league: {
          teams: [
            { aId: 'p1', bId: 'p2' },
            { aId: 'p3', bId: 'p4' },
          ],
          pointsPerMatch: 1,
        },
      },
    };
    const scramble: Round = { ...scrambleRound({}), id: 's', status: 'finished', updatedAt: 5 };
    saveRounds([league, scramble]);
    renderHome(noop);
    expect(card()).toBeNull();
  });

  it('gives way to the Resume card while a round is live', () => {
    saveRounds([
      finished('live', { status: 'in_progress', updatedAt: Date.now() }),
      finished('a'),
    ]);
    const { container } = renderHome(noop);
    expect(container.querySelector('.resume-card')).toBeTruthy();
    expect(card()).toBeNull();
  });

  it('is absent where Home is given nowhere to send it', () => {
    saveRounds([finished('a')]);
    renderHome();
    expect(card()).toBeNull();
  });
});
