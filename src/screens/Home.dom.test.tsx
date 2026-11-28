// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Home } from './Home';
import { saveRounds } from '../storage';
import { makeRound } from '../games/testFixtures';

/**
 * Home's first-run help and the League / Scramble tiles: "New here?" opens
 * the three-card How Trunk works, which leads on to a round or the full rules.
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
const setup = () => {
  const onNew = vi.fn();
  render(
    <Home
      onNew={onNew}
      onNewLeague={noop}
      onNewScramble={noop}
      onResume={noop}
      onViewResults={noop}
      onStats={noop}
      onHistory={noop}
    />
  );
  return { onNew };
};
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

describe('Home: League and Scramble', () => {
  it('keep their names and describe themselves', () => {
    setup();
    const league = screen.getByRole('button', { name: 'Golf League' });
    const scramble = screen.getByRole('button', { name: 'Scramble' });
    expect(describedBy(league)).toBe('A weekly 2-on-2 night');
    expect(describedBy(scramble)).toBe('Everyone hits, best ball');
    // The visible word is still inside each name, for voice control.
    expect(league.textContent).toContain('League');
    expect(scramble.textContent).toContain('Scramble');
  });
});
