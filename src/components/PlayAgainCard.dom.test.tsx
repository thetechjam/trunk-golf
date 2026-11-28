// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayAgainCard } from './PlayAgainCard';
import { makeRound, player } from '../games/testFixtures';

afterEach(cleanup);

const round = () => {
  const r = makeRound({
    players: [player('p1', 'Mike'), player('p2', 'Dave'), player('p3', 'Chris'), player('p4', 'Tom')],
    games: ['nassau', 'skins'],
    options: { stakes: { nassau: 5, skins: 2 } },
    status: 'finished',
  });
  return { ...r, course: 'Sunset Ridge' };
};

describe('PlayAgainCard', () => {
  it('reads Play again, where and who, and the money, as one button', () => {
    render(<PlayAgainCard round={round()} onPlay={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Play again');
    expect(screen.getByText('Sunset Ridge · Mike, Dave, Chris & Tom')).toBeTruthy();
    expect(screen.getByText('$5 Nassau · $2 Skins')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Play again Sunset Ridge · Mike, Dave, Chris & Tom $5 Nassau · $2 Skins',
      })
    ).toBe(buttons[0]);
  });

  it('never has an element that is just the course name', () => {
    render(<PlayAgainCard round={round()} onPlay={() => {}} />);
    expect(screen.queryByText('Sunset Ridge')).toBeNull();
  });

  it('calls onPlay when tapped', () => {
    const onPlay = vi.fn();
    render(<PlayAgainCard round={round()} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
