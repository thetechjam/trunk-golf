// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Results } from './Results';
import { holes18, scrambleRound } from '../games/testFixtures';

/**
 * Results for a scramble. One team has beaten nobody, so its headline is the
 * number it hands in; two or more get the usual winner. Either way the tee
 * shots follow the board, and travel in the text that goes to the group chat.
 */

vi.mock('../shareCard', () => ({ renderShareCard: vi.fn() }));
vi.mock('../scorecardCard', () => ({ renderScorecardCard: vi.fn() }));
import { renderShareCard } from '../shareCard';

const nine = holes18().slice(0, 9);
const pars = (t: string, scores: number[]) =>
  Object.fromEntries(nine.map((h, i) => [h.number, { [t]: scores[i] }]));

const show = (round: Round) =>
  render(<Results round={round} onChange={() => {}} onHome={() => {}} onBackToPlay={() => {}} />);

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
  });
});
afterEach(cleanup);

const one = scrambleRound({
  teams: [{ name: 'Jesse & Sam', members: ['Jesse', 'Sam', 'Al'] }],
  holes: nine,
  minDrives: 2,
  // 32 on a par-36 nine.
  scores: pars('t1', [3, 4, 3, 4, 3, 4, 3, 4, 4]),
  shots: { 1: { t1: [0] }, 2: { t1: [1] }, 3: { t1: [0, 2, 2] } },
  status: 'finished',
});

describe('one team', () => {
  it('headlines the team’s total and to-par, not a win', () => {
    show(one);
    const hero = document.querySelector('.winner-hero')!;
    expect(hero.querySelector('.winner-line')!.textContent).toBe('32 · −4');
    expect(hero.querySelector('.winner-sub')!.textContent).toBe('Jesse & Sam');
    expect(hero.textContent).not.toMatch(/wins/);
  });

  it('counts teams, has no settlement to make, and follows the board with the tee shots', () => {
    show(one);
    expect(document.querySelector('.results-sub')!.textContent).toContain('1 team');
    expect(document.querySelector('.settlement')).toBeNull();
    expect(document.querySelector('.awards')).toBeNull();
    const boards = [...document.querySelectorAll('.boards > .board')];
    expect(boards.map((b) => b.querySelector('.board-title')!.textContent)).toEqual([
      'Scramble',
      'Tee shots',
    ]);
    // Not "All square" over a field of one.
    expect(boards[0].querySelector('.board-status')!.textContent).toBe('Final');
    expect(boards[0].querySelector('.board-detail')!.textContent).toBe('32 (−4)');
  });

  it('puts whose drives were used in the text it shares', async () => {
    vi.mocked(renderShareCard).mockRejectedValueOnce(new Error('no canvas'));
    show(one);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Share results' }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('Tee shots: Jesse 2, Sam 1, Al 0');
    expect(written[0]).toContain('via Trunk · trunk.golf');
  });
});

describe('two teams', () => {
  it('keeps the usual winner, and a tee shots card per team', () => {
    show(
      scrambleRound({
        teams: [
          { name: 'Hackers', members: ['Jesse', 'Sam'] },
          { name: 'Fore Play', members: ['Al', 'Bo'] },
        ],
        holes: nine,
        scores: Object.fromEntries(nine.map((h) => [h.number, { t1: 4, t2: 5 }])),
        status: 'finished',
      })
    );
    expect(document.querySelector('.winner-line')!.textContent).toBe('Hackers wins');
    expect(screen.getByRole('region', { name: 'Tee shots, Hackers' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tee shots, Fore Play' })).toBeTruthy();
    expect(document.querySelector('.results-sub')!.textContent).toContain('2 teams');
  });
});

/**
 * One team has no settle-up for the backup card to follow, and a scramble has
 * no awards, so it does not sit straight under the hero: it comes after the
 * boards, before Share.
 */
describe('the backup card on a one-team scramble', () => {
  const follows = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const showJustFinished = (round: Round) => {
    // The card asks about rounds on this device, so the round has to be kept,
    // and changed since the (absent) last backup.
    localStorage.setItem('press.rounds.v1', JSON.stringify([{ ...round, updatedAt: 5 }]));
    return render(
      <Results round={round} onChange={() => {}} onHome={() => {}} onBackToPlay={() => {}} justFinished />
    );
  };
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('comes after the boards, not under the hero, and before Share', () => {
    const { container } = showJustFinished(one);
    const card = container.querySelector('.keep-rounds')!;
    const hero = container.querySelector('.winner-hero')!;
    const boards = container.querySelector('.boards')!;
    const share = container.querySelector('.share-open')!;
    expect(card).toBeTruthy();
    expect(hero.nextElementSibling).not.toBe(card);
    expect(follows(boards, card)).toBe(true);
    expect(follows(card, share)).toBe(true);
  });

  it('two teams keep it under the settle-up', () => {
    const two = scrambleRound({
      teams: [
        { name: 'Hackers', members: ['Jesse', 'Sam'] },
        { name: 'Fore Play', members: ['Al', 'Bo'] },
      ],
      holes: nine,
      scores: Object.fromEntries(nine.map((h) => [h.number, { t1: 4, t2: 5 }])),
      status: 'finished',
    });
    const { container } = showJustFinished(two);
    const card = container.querySelector('.keep-rounds')!;
    const settlement = container.querySelector('.settlement')!;
    expect(card && settlement).toBeTruthy();
    expect(follows(settlement, card)).toBe(true);
    expect(follows(card, container.querySelector('.boards')!)).toBe(true);
  });
});
