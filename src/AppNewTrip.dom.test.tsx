// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Round } from './types';
import { makeRound, player } from './games/testFixtures';
import { todayIso } from './roundDate';

/**
 * Home's Trip row, end to end: it opens New Round ready to name a trip, with
 * the name field keeping focus (App's heading focus must not take it back),
 * and the round started is on that trip. If a trip is already going, it opens
 * on that trip instead. The next Start New Round is the ordinary one.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const stored = () => JSON.parse(localStorage.getItem('press.rounds.v1') ?? '[]') as Round[];
const TRIP = { id: 't1', name: 'Myrtle 27' };
const onTrip: Round = {
  ...makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')], status: 'finished' }),
  id: 'old',
  course: 'Dunes',
  date: todayIso(),
  updatedAt: Date.now(),
  trip: TRIP,
};

const openTripRow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Trip' }));
  expect(await screen.findByRole('heading', { name: 'New Round' })).toBeTruthy();
};
const players = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('Player 1'), 'Al');
  await user.type(screen.getByPlaceholderText('Player 2'), 'Bo');
};

describe('App — Trip from Home', () => {
  it('opens New Round with the trip name focused, and starts the round on that trip', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTripRow(user);
    const name = screen.getByLabelText('Trip name');
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(screen.getByRole('button', { name: '+ New trip' }).getAttribute('aria-pressed')).toBe('true');

    await user.type(name, 'Pinehurst');
    await players(user);
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeTruthy();

    const rounds = stored();
    expect(rounds).toHaveLength(1);
    expect(rounds[0].trip?.name).toBe('Pinehurst');
  });

  it('leaves the next Start New Round without the trip block open', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTripRow(user);
    history.back();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trunk' })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Start New Round' }));
    const h1 = await screen.findByRole('heading', { name: 'New Round' });
    expect(screen.queryByLabelText('Trip name')).toBeNull();
    expect(screen.getByRole('button', { name: /Add to a trip/ })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('with a trip going, opens on that trip and keeps the round on it', async () => {
    localStorage.setItem('press.rounds.v1', JSON.stringify([onTrip]));
    const user = userEvent.setup();
    render(<App />);

    await openTripRow(user);
    expect(screen.queryByLabelText('Trip name')).toBeNull();
    expect(screen.getByRole('button', { name: TRIP.name }).getAttribute('aria-pressed')).toBe('true');

    await players(user);
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeTruthy();

    const fresh = stored().find((r) => r.id !== 'old')!;
    expect(fresh.trip).toEqual(TRIP);
  });
});
