// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Setup } from './Setup';
import { SetupRow } from '../components/SetupRow';
import { todayIso } from '../roundDate';
import { makeRound, player, holes } from '../games/testFixtures';

/**
 * New Round without a Money row, and with the trip as a quiet line rather
 * than a row: stakes ride on the closed Games row, and the trip is one line
 * after the rows (or "On the … trip"), opening to the picker when asked —
 * or straight away, at the top, when Home's Trip row opened the screen.
 */

const TRIP = { id: 't1', name: "Myrtle '27" };

function round(id: string, over: Partial<Round> = {}): Round {
  const r = makeRound({
    players: [player(`${id}-a`, 'Al'), player(`${id}-b`, 'Bo')],
    holes: holes(9),
    games: ['skins'],
    status: 'finished',
  });
  return { ...r, id, date: todayIso(), updatedAt: Date.now(), course: `Course ${id}`, ...over };
}

const store = (rounds: Round[]) => localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
/** A trip being played this week. */
const onTrip = () => store([round('a', { trip: TRIP })]);
/** A trip from months ago: offered as a chip, but not the one being played. */
const pastTrip = () => store([round('a', { date: '2025-06-01', trip: { id: 't0', name: 'Pinehurst' } })]);

const heads = () =>
  [...document.querySelectorAll('.setup-row-head .setup-row-label')].map((el) => el.textContent);
const pressed = () =>
  [...document.querySelectorAll('.trip-chip[aria-pressed="true"]')].map((el) => el.textContent);
const nameField = () => screen.queryByLabelText<HTMLInputElement>('Trip name');

async function name2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Player 1'), 'Al');
  await user.type(screen.getByPlaceholderText('Player 2'), 'Bo');
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('New Round rows', () => {
  it('has no Money row: Course, Games and Holes & pars only', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    expect(heads()).toEqual(['Course', 'Games', 'Holes & pars']);
    expect(
      [...document.querySelectorAll('.setup-row-head')].some((h) => h.textContent?.includes('Money'))
    ).toBe(false);
  });
});

describe('SetupRow tail', () => {
  it('reads as summary · tail, with the tail in its own span', () => {
    render(
      <SetupRow label="Games" summary="Nassau, Skins" tail="$5 / $2" open={false} onToggle={() => {}}>
        {null}
      </SetupRow>
    );
    const summary = document.querySelector('.setup-row-summary')!;
    expect(summary.textContent).toBe('Nassau, Skins · $5 / $2');
    expect(summary.querySelector('.setup-row-summary-main')?.textContent).toBe('Nassau, Skins');
    expect(summary.querySelector('.setup-row-tail')?.textContent).toBe(' · $5 / $2');
  });

  it('is markup-for-markup unchanged without one (League, Scramble)', () => {
    render(
      <SetupRow label="Pars" summary="Par 36" open={false} onToggle={() => {}}>
        {null}
      </SetupRow>
    );
    const summary = document.querySelector('.setup-row-summary')!;
    expect(summary.className).toBe('setup-row-summary');
    expect(summary.innerHTML).toBe('Par 36');
    expect(document.querySelector('.setup-row-tail')).toBeNull();
  });
});

describe('the trip line, with no trip going', () => {
  it('shows one quiet line after the rows, not a picker', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const line = screen.getByRole('button', { name: /Add to a trip/ });
    expect(line.textContent).toBe('Playing a few rounds this weekend? Add to a trip');
    expect(line.className).toContain('setup-trip-line');
    // In the flow after the rows, not in the pinned foot.
    const rows = document.querySelector('.setup-rows')!;
    expect(rows.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.closest('.screen-foot')).toBeNull();
    expect(document.querySelector('.trip-chips')).toBeNull();
  });

  it('opens to the name field when there is no trip to choose', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Add to a trip/ }));
    expect(document.querySelector('.setup-trip-open .trip-chips')).not.toBeNull();
    expect(document.querySelector('.setup-trip-open .hint')?.textContent).toMatch(/settle up once/);
    expect(pressed()).toEqual(['+ New trip']);
    expect(document.activeElement).toBe(nameField());
    expect(screen.queryByRole('button', { name: /Add to a trip/ })).toBeNull();
  });

  it('opens on No trip, focused, when a past trip is there to pick', async () => {
    const user = userEvent.setup();
    pastTrip();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Add to a trip/ }));
    expect(pressed()).toEqual(['No trip']);
    expect(nameField()).toBeNull();
    expect(document.activeElement?.textContent).toBe('No trip');
    expect(screen.getByRole('button', { name: 'Pinehurst' })).toBeTruthy();
  });
});

describe('the trip line, with a trip going', () => {
  it('says which trip, with Change beside it', () => {
    onTrip();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    expect(document.querySelector('.setup-trip-on')?.textContent).toContain("On the Myrtle '27 trip");
    expect(screen.queryByRole('button', { name: /Add to a trip/ })).toBeNull();
    expect(document.querySelector('.trip-chips')).toBeNull();
  });

  it('Change opens the picker on that trip, and No trip takes the round off it', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    onTrip();
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    await user.click(screen.getByRole('button', { name: 'Change trip' }));
    expect(pressed()).toEqual(["Myrtle '27"]);
    expect(document.activeElement?.textContent).toBe("Myrtle '27");
    expect(nameField()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'No trip' }));
    // Stays open, so the choice shows.
    expect(pressed()).toEqual(['No trip']);
    await name2(user);
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started).toHaveLength(1);
    expect(started[0].trip).toBeUndefined();
  });

  it('a played-again round still joins the trip being played', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    const old = round('old', { date: '2025-05-01' });
    store([round('a', { trip: TRIP }), old]);
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} again={old} />);
    expect(document.querySelector('.setup-trip-on')?.textContent).toContain("Myrtle '27");
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started[0]?.trip).toEqual(TRIP);
  });
});

describe('opened from Home’s Trip row', () => {
  it('leads with the trip, on a new trip’s name', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} startTrip />);
    const block = document.querySelector('.setup-trip-open')!;
    const players = screen.getByRole('heading', { name: 'Players' }).closest('section')!;
    expect(block.compareDocumentPosition(players) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nameField()).not.toBeNull();
    expect(pressed()).toEqual(['+ New trip']);
    await user.type(nameField()!, 'Bandon');
    await name2(user);
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started[0]?.trip?.name).toBe('Bandon');
  });

  it('names a new trip even with a past one to offer', () => {
    pastTrip();
    render(<Setup onCancel={() => {}} onStart={() => {}} startTrip />);
    expect(nameField()).not.toBeNull();
    expect(pressed()).toEqual(['+ New trip']);
  });

  it('opens on the trip already going, without asking for a name', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    onTrip();
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} startTrip />);
    expect(nameField()).toBeNull();
    expect(pressed()).toEqual(["Myrtle '27"]);
    await name2(user);
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started[0]?.trip).toEqual(TRIP);
  });
});
