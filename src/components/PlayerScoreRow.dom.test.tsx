// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PlayerScoreRow } from './PlayerScoreRow';

/**
 * The tag under a player's score on the Hole tab.
 *
 * An unscored player used to carry a "TAP" tag, which read as jargon to decode
 * rather than an instruction. The dash alone says "no score yet"; the tag is
 * kept for what it names well — a birdie, a bogey, a pick-up.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function row(props: { value: number | null; pickedUp?: boolean }) {
  const { container } = render(
    <PlayerScoreRow
      name="Al"
      color="#2a7"
      par={4}
      value={props.value}
      pickedUp={props.pickedUp}
      onChange={() => {}}
      onPickup={() => {}}
    />
  );
  return {
    num: container.querySelector('.stepper-value .score-num')?.textContent,
    tag: container.querySelector('.stepper-value .score-tag')?.textContent ?? null,
    valueText: container.querySelector('.stepper-value')?.textContent ?? '',
  };
}

describe('PlayerScoreRow tag', () => {
  it('shows only the dash on an unscored player, no "tap"', () => {
    const r = row({ value: null });
    expect(r.num).toBe('–');
    expect(r.tag).toBeNull();
    expect(r.valueText.toLowerCase()).not.toContain('tap');
  });

  it('names the score once one is entered', () => {
    expect(row({ value: 3 }).tag).toBe('Birdie');
    cleanup();
    expect(row({ value: 4 }).tag).toBe('Par');
  });

  it('says "picked up" on a pick-up', () => {
    const r = row({ value: null, pickedUp: true });
    expect(r.num).toBe('X');
    expect(r.tag).toBe('picked up');
  });
});
