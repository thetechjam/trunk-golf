// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Round } from './types';

/**
 * Home's Play again, end to end: the card opens a New Round already filled
 * in from that round, Start Round makes a fresh round from it, and the next
 * Start New Round is the ordinary blank one again.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const hs = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: [4, 5, 3][i % 3],
  strokeIndex: ((i * 7) % 18) + 1,
}));

const last: Round = {
  id: 'old',
  course: 'Sunset Ridge',
  date: '2026-09-11',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Mike', handicap: 8 },
    { id: 'p2', name: 'Dave', handicap: 14 },
    { id: 'p3', name: 'Chris', handicap: 3 },
    { id: 'p4', name: 'Tom', handicap: 20 },
  ],
  holes: hs,
  slope: 128,
  rating: 70.4,
  games: ['nassau', 'skins'],
  options: {
    useNet: false,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { nassau: 5, skins: 2 },
    nassau: { mode: '2v2', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'] },
  },
  scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: 5, p3: 4, p4: 6 }])),
  wolf: {},
  status: 'finished',
};

const stored = () => JSON.parse(localStorage.getItem('press.rounds.v1') ?? '[]') as Round[];
const nameFields = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]')].map((f) => f.value);

describe('App — Play again', () => {
  it('opens New Round filled in from the last round, and starts a fresh round from it', async () => {
    localStorage.setItem('press.rounds.v1', JSON.stringify([last]));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^Play again Sunset Ridge · Mike, Dave, Chris & Tom/ }));
    expect(await screen.findByRole('heading', { name: 'New Round' })).toBeTruthy();
    expect(nameFields()).toEqual(['Mike', 'Dave', 'Chris', 'Tom']);
    expect(screen.getByText(/^Same players, course and games as last time/)).toBeTruthy();
    expect(screen.getByText('Sunset Ridge')).toBeTruthy();
    expect(screen.getByText('$5 Nassau · $2 Skins')).toBeTruthy();
    // Nothing is written until Start Round.
    expect(stored()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeTruthy();

    const rounds = stored();
    expect(rounds).toHaveLength(2);
    const fresh = rounds.find((r) => r.id !== 'old')!;
    expect(fresh.status).toBe('in_progress');
    expect(fresh.course).toBe('Sunset Ridge');
    expect(fresh.holes.map((h) => [h.par, h.strokeIndex])).toEqual(hs.map((h) => [h.par, h.strokeIndex]));
    expect(fresh.slope).toBe(128);
    expect(fresh.rating).toBe(70.4);
    expect(fresh.games).toEqual(['nassau', 'skins']);
    expect(fresh.options.stakes).toMatchObject({ nassau: 5, skins: 2 });
    expect(fresh.players.map((p) => [p.name, p.handicap])).toEqual([
      ['Mike', 8],
      ['Dave', 14],
      ['Chris', 3],
      ['Tom', 20],
    ]);
    expect(fresh.players.some((p) => last.players.some((q) => q.id === p.id))).toBe(false);
    const byId = (id: string) => fresh.players.find((p) => p.id === id)?.name;
    const teams = fresh.options.nassau!;
    expect(teams.mode).toBe('2v2');
    expect(teams.teamA.map(byId).sort()).toEqual(['Mike', 'Tom']);
    expect(teams.teamB.map(byId).sort()).toEqual(['Chris', 'Dave']);
    expect(Object.keys(fresh.scores).filter((h) => Object.keys(fresh.scores[+h] ?? {}).length > 0)).toEqual(
      []
    );
  });

  it('leaves the next Start New Round blank', async () => {
    localStorage.setItem('press.rounds.v1', JSON.stringify([last]));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^Play again/ }));
    await screen.findByRole('heading', { name: 'New Round' });
    history.back();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trunk' })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Start New Round' }));
    await screen.findByRole('heading', { name: 'New Round' });
    expect(nameFields()).toEqual(['', '']);
    expect(screen.queryByText(/Same players.*as last time/)).toBeNull();
  });
});
