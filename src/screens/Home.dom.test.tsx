// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Home } from './Home';
import { saveRounds } from '../storage';
import { makeRound } from '../games/testFixtures';

/**
 * Home's first-run help and the "Or start something else" list (Trip,
 * Scramble, League): "New here?" opens the three-card How Trunk works, which
 * leads on to a round or the full rules.
 */

let clock = 0;
beforeEach(() => {
  clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const noop = () => {};
const setup = ({ trip = true }: { trip?: boolean } = {}) => {
  const onNew = vi.fn();
  const onNewLeague = vi.fn();
  const onNewScramble = vi.fn();
  const onNewTrip = vi.fn();
  const { container } = render(
    <Home
      onNew={onNew}
      onNewLeague={onNewLeague}
      onNewScramble={onNewScramble}
      onNewTrip={trip ? onNewTrip : undefined}
      onResume={noop}
      onViewResults={noop}
      onStats={noop}
      onHistory={noop}
    />
  );
  return { onNew, onNewLeague, onNewScramble, onNewTrip, container };
};
const TRIP_SUB = 'Several rounds this weekend. Keep score each day, settle the money once at the end.';
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const NEW_HERE = 'New here? See how it works ›';
const openWalk = () => fireEvent.click(screen.getByRole('button', { name: NEW_HERE }));
const describedBy = (el: HTMLElement) =>
  document.getElementById(el.getAttribute('aria-describedby')!)?.textContent;

describe('Home: New here?', () => {
  it('opens How Trunk works, not How to Play', () => {
    setup();
    openWalk();
    expect(screen.getByRole('dialog', { name: 'How Trunk works' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'How to Play' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Add the group' })).toBeTruthy();
  });

  it('"Start a round" on the last card starts a new round', () => {
    const { onNew } = setup();
    openWalk();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    clock += 400;
    fireEvent.click(screen.getByRole('button', { name: 'Start a round' }));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'How Trunk works' })).toBeNull();
  });

  it('"Full rules" swaps to How to Play', () => {
    setup();
    openWalk();
    fireEvent.click(screen.getByRole('button', { name: 'Full rules ›' }));
    expect(screen.getByRole('dialog', { name: 'How to Play' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'How Trunk works' })).toBeNull();
  });

  it('is not offered once there is a saved round', () => {
    saveRounds([makeRound({ status: 'finished' })]);
    setup();
    expect(screen.queryByRole('button', { name: NEW_HERE })).toBeNull();
  });
});

describe('Home: Or start something else', () => {
  it('keeps League and Scramble names, adds Trip, and describes each', () => {
    setup();
    const trip = screen.getByRole('button', { name: 'Trip' });
    const league = screen.getByRole('button', { name: 'Golf League' });
    const scramble = screen.getByRole('button', { name: 'Scramble' });
    expect(describedBy(trip)).toBe(TRIP_SUB);
    expect(describedBy(league)).toBe('A weekly 2-on-2 night');
    expect(describedBy(scramble)).toBe('Everyone hits, best shot');
    // The visible word is still inside each name, for voice control.
    expect(trip.textContent).toContain('Trip');
    expect(league.textContent).toContain('League');
    expect(scramble.textContent).toContain('Scramble');
  });

  it('sits under its heading, in the order Trip, Scramble, League', () => {
    setup();
    const section = screen.getByRole('region', { name: 'Or start something else' });
    expect(screen.getByRole('heading', { name: 'Or start something else' })).toBeTruthy();
    const names = [...section.querySelectorAll('.home-more-row')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Trip', 'Scramble', 'Golf League']);
  });

  it('comes after Start New Round', () => {
    const { container } = setup();
    const start = screen.getByRole('button', { name: 'Start New Round' });
    expect(follows(start, container.querySelector('.home-more')!)).toBe(true);
    expect(start.className).toContain('btn-primary');
  });

  it('each row calls its own callback once', () => {
    const { onNew, onNewLeague, onNewScramble, onNewTrip } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scramble' }));
    fireEvent.click(screen.getByRole('button', { name: 'Golf League' }));
    expect(onNewTrip).toHaveBeenCalledTimes(1);
    expect(onNewScramble).toHaveBeenCalledTimes(1);
    expect(onNewLeague).toHaveBeenCalledTimes(1);
    expect(onNew).not.toHaveBeenCalled();
  });

  it('has no Trip row without onNewTrip', () => {
    setup({ trip: false });
    expect(screen.queryByRole('button', { name: 'Trip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Golf League' })).toBeTruthy();
  });

  it('has no disclosure toggle with no round in play', () => {
    setup();
    expect(document.querySelector('.home-more-toggle')).toBeNull();
  });

  it('keeps "New here?" in the empty state, after the list', () => {
    const { container } = setup();
    const help = screen.getByRole('button', { name: NEW_HERE });
    expect(follows(container.querySelector('.home-more')!, help)).toBe(true);
  });
});

describe('Home: Or start something else, mid-round', () => {
  beforeEach(() => saveRounds([{ ...makeRound({ status: 'active' }), updatedAt: Date.now() }]));

  it('folds the rows behind a closed toggle, and opens on a click', () => {
    const { onNewLeague } = setup();
    const toggle = screen.getByRole('button', { name: 'Or start something else' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('home-more-rows');
    expect(screen.queryByRole('button', { name: 'Golf League' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trip' })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('home-more-rows')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Golf League' }));
    expect(onNewLeague).toHaveBeenCalledTimes(1);
  });

  it('leaves Start New Round secondary under Resume', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Start New Round' }).className).toContain('btn-secondary');
  });
});
