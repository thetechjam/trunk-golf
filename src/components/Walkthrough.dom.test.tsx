// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Walkthrough } from './Walkthrough';

/**
 * "How Trunk works": three cards from "New here?" on an empty Home, moved by
 * Back / Next or a sideways swipe, ending on "Start a round".
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

const setup = () => {
  const onClose = vi.fn();
  const onStart = vi.fn();
  const onRules = vi.fn();
  render(<Walkthrough onClose={onClose} onStart={onStart} onRules={onRules} />);
  return { onClose, onStart, onRules };
};
const title = () => document.querySelector('.walk-title')!.textContent;
const step = () => document.querySelector('.walk-step')!.textContent;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
const card = () => document.querySelector('.walk')!;
const swipe = (dx: number, dy: number) => {
  const from = { clientX: 200, clientY: 300 };
  const to = { clientX: 200 + dx, clientY: 300 + dy };
  fireEvent.touchStart(card(), { changedTouches: [from], touches: [from] });
  fireEvent.touchEnd(card(), { changedTouches: [to], touches: [] });
};

describe('Walkthrough', () => {
  it('is a dialog named "How Trunk works", opening on the first card', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'How Trunk works' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Add the group' })).toBeTruthy();
    expect(step()).toBe('1 of 3');
    expect(
      screen.getByText('Names and handicaps, the games you’re playing, and a stake on each.')
    ).toBeTruthy();
    // Kept in the row so nothing shifts, but not offered.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start a round' })).toBeNull();
  });

  it('Next walks the three cards and Back returns', () => {
    setup();
    next();
    expect(title()).toBe('Tap the scores');
    expect(step()).toBe('2 of 3');
    next();
    expect(title()).toBe('Settle up');
    expect(step()).toBe('3 of 3');
    back();
    expect(title()).toBe('Tap the scores');
    back();
    expect(title()).toBe('Add the group');
  });

  it('marks the current card in the dots, which are decorative', () => {
    setup();
    next();
    const dots = [...document.querySelectorAll('.walk-dot')];
    expect(dots.map((d) => d.classList.contains('on'))).toEqual([false, true, false]);
    expect(document.querySelector('.walk-dots')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('reads each new card out', () => {
    setup();
    const live = document.querySelector('[aria-live="polite"]')!;
    next();
    expect(live.textContent).toContain('Tap the scores');
  });

  it('the last card offers "Start a round" instead of Next, which calls onStart', () => {
    const { onStart } = setup();
    next();
    next();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    clock += 400;
    fireEvent.click(screen.getByRole('button', { name: 'Start a round' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('ignores a double tap on Next landing on "Start a round"', () => {
    const { onStart } = setup();
    next();
    clock += 400;
    next();
    clock += 120;
    fireEvent.click(screen.getByRole('button', { name: 'Start a round' }));
    expect(onStart).not.toHaveBeenCalled();
    clock += 300;
    fireEvent.click(screen.getByRole('button', { name: 'Start a round' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('moves focus from Next to "Start a round" when Next gives way to it', () => {
    setup();
    next();
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    nextBtn.focus();
    fireEvent.click(nextBtn);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start a round' }));
  });

  it('links the video in a new tab on every card', () => {
    setup();
    for (let i = 0; i < 3; i++) {
      const link = screen.getByRole('link', { name: 'Watch the 80-second video ↗' });
      expect(link.getAttribute('href')).toBe('https://youtu.be/bUL6qcGF6XI');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      if (i < 2) next();
    }
  });

  it('"Full rules" calls onRules', () => {
    const { onRules } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Full rules ›' }));
    expect(onRules).toHaveBeenCalledTimes(1);
  });

  it('a left swipe goes forward and a right swipe back', () => {
    setup();
    swipe(-80, 10);
    expect(title()).toBe('Tap the scores');
    swipe(-80, 10);
    expect(title()).toBe('Settle up');
    // Nothing past the last card.
    swipe(-80, 10);
    expect(title()).toBe('Settle up');
    swipe(80, -5);
    expect(title()).toBe('Tap the scores');
  });

  it('a mostly vertical or short move does not change the card', () => {
    setup();
    swipe(-60, 70);
    expect(title()).toBe('Add the group');
    swipe(-40, 0);
    expect(title()).toBe('Add the group');
    // Nothing before the first card.
    swipe(80, 0);
    expect(title()).toBe('Add the group');
  });

  it('a swipe on the cards does not start the sheet’s drag-to-dismiss', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { onClose } = setup();
      const at = { clientX: 200, clientY: 100 };
      fireEvent.touchStart(card(), { changedTouches: [at], touches: [at] });
      const down = { clientX: 200, clientY: 600 };
      fireEvent.touchMove(card(), { changedTouches: [down], touches: [down] });
      fireEvent.touchEnd(card(), { changedTouches: [down], touches: [] });
      vi.advanceTimersByTime(500);
      expect(onClose).not.toHaveBeenCalled();
      expect((document.querySelector('.sheet') as HTMLElement).style.transform).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes from the X', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { onClose } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      vi.advanceTimersByTime(500);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
