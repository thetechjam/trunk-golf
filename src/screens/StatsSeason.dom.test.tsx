// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Stats } from './Stats';

/**
 * The "This season" card on Stats. The arithmetic is in `season.test.ts`;
 * this is when the card appears, what it is called, and what it follows.
 */

const holes = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
const THIS_YEAR = new Date().getFullYear();

/** A finished nine; `over` is strokes over 36 per name. Low score wins $5 from each. */
const round = (
  id: string,
  date: string,
  over: Record<string, number>,
  stake = 5
): Round => {
  const names = Object.keys(over);
  const players = names.map((name, i) => ({ id: `${id}${i}`, name }));
  return {
    id,
    course: 'Sunset Ridge',
    date,
    createdAt: 1,
    updatedAt: 1,
    holes,
    games: ['strokePlay'],
    options: {
      useNet: false,
      stablefordMode: 'standard',
      loneWolfMultiplier: 2,
      blindWolfMultiplier: 3,
      stakes: stake ? { strokePlay: stake } : {},
    },
    wolf: {},
    status: 'finished',
    players,
    scores: Object.fromEntries(
      holes.map((h) => [
        h.number,
        Object.fromEntries(players.map((p) => [p.id, h.number === 1 ? 4 + over[p.name] : 4])),
      ])
    ),
  };
};

const show = (rounds: Round[]) => {
  localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
  return render(<Stats onBack={() => {}} />);
};

const card = () => document.querySelector<HTMLElement>('section.season');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Stats: this season', () => {
  it('says league nights are not counted when the year had one', () => {
    const night = round('n', `${THIS_YEAR}-06-02`, { Tom: 3, Mike: 0 });
    night.options.league = { teams: [] } as never;
    show([night, round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 })]);
    const season = card()!;
    // The player cards below count the league night; the season does not.
    expect(within(season).getByText(`${THIS_YEAR} · 1 round`)).toBeTruthy();
    expect(season.querySelector('.season-note')?.textContent).toBe(
      'Net money over 1 round with stakes. League nights not counted.'
    );
  });

  it('shows the year’s money, signed, with the crew head to head', () => {
    show([
      round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 }),
      round('b', `${THIS_YEAR}-05-01`, { Tom: 0, Mike: 1 }),
      round('c', `${THIS_YEAR}-04-01`, { Tom: 2, Mike: 0 }),
    ]);
    const season = screen.getByRole('region', { name: 'This season' });
    expect(season).toBe(card());
    expect(within(season).getByText(`${THIS_YEAR} · 3 rounds`)).toBeTruthy();
    const rows = [...season.querySelectorAll('.season-money li')].map((li) => li.textContent);
    expect(rows).toEqual(['TOTom3 rounds+$5', 'MIMike3 rounds−$5']);
    expect(season.querySelector('.season-net.up')?.textContent).toBe('+$5');
    expect(season.querySelector('.season-net.down')?.textContent).toBe('−$5');
    expect(within(season).getByText('Net money over 3 rounds with stakes.')).toBeTruthy();
    expect(within(season).getByRole('heading', { name: 'Head to head' })).toBeTruthy();
    expect(season.querySelector('.season-h2h li')?.textContent).toBe(
      'Tom v Mike2–13 rounds together · Tom +$5, Mike −$5'
    );
  });

  it('sits above the player cards and leaves their selectors alone', () => {
    show([round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 })]);
    const cards = [...document.querySelectorAll('.stat-card')];
    expect(cards[0]).toBe(card());
    expect(card()?.querySelector('.stat-name, .hint')).toBeNull();
    // The footer hint is still the screen's first `.hint`.
    expect(document.querySelector('.hint')?.textContent).toMatch(/^Counted from/);
  });

  it('names a past year "2025 season", and follows the year segment', async () => {
    const user = userEvent.setup();
    show([
      round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 }),
      round('b', `${THIS_YEAR - 1}-06-01`, { Tom: 1, Mike: 0 }),
      round('c', `${THIS_YEAR - 1}-05-01`, { Tom: 1, Mike: 0 }),
    ]);
    expect(screen.getByRole('region', { name: 'This season' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: String(THIS_YEAR - 1) }));
    const past = screen.getByRole('region', { name: `${THIS_YEAR - 1} season` });
    expect(past.querySelector('.season-count')?.textContent).toBe('2 rounds');
    expect(past.querySelector('.season-net.up')?.textContent).toBe('+$10');
    expect(screen.queryByRole('region', { name: 'This season' })).toBeNull();
  });

  it('with "All", falls back to the latest year that has rounds', () => {
    show([
      round('b', `${THIS_YEAR - 1}-06-01`, { Tom: 1, Mike: 0 }),
      round('c', `${THIS_YEAR - 2}-05-01`, { Tom: 1, Mike: 0 }),
    ]);
    const season = screen.getByRole('region', { name: `${THIS_YEAR - 1} season` });
    expect(season.querySelector('.season-count')?.textContent).toBe('1 round');
  });

  it('is hidden while searching', async () => {
    const user = userEvent.setup();
    show([
      round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 }),
      round('b', `${THIS_YEAR}-05-01`, { Tom: 0, Mike: 1 }),
    ]);
    expect(card()).not.toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Search rounds' }), 'tom');
    expect(card()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(card()).not.toBeNull();
  });

  it('is absent when nothing was played for money', () => {
    show([
      round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 }, 0),
      round('b', `${THIS_YEAR}-05-01`, { Tom: 0, Mike: 1 }, 0),
    ]);
    expect(card()).toBeNull();
    expect(screen.queryByText(/season/i)).toBeNull();
  });

  it('shows "Even" for a level year and "—" for someone who never played for money', () => {
    show([
      round('a', `${THIS_YEAR}-06-01`, { Tom: 0, Mike: 1 }),
      round('b', `${THIS_YEAR}-05-01`, { Tom: 1, Mike: 0 }),
      round('c', `${THIS_YEAR}-04-01`, { Tom: 0, Zed: 1 }, 0),
    ]);
    const nets = Object.fromEntries(
      [...card()!.querySelectorAll('.season-money li')].map((li) => [
        li.querySelector('.season-who')?.textContent,
        li.querySelector('.season-net')?.textContent,
      ])
    );
    expect(nets).toEqual({ Tom: 'Even', Mike: 'Even', Zed: '—' });
    expect(card()!.querySelector('.season-h2h li')?.textContent).toMatch(/1–1/);
  });
});
