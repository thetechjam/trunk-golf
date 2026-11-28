// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Setup } from './Setup';
import type { GameOptions, Round } from '../types';
import { realCard18 } from '../games/testFixtures';
import { sliceCourseHoles } from '../courses/openGolfApi';

/**
 * New Round remembers the course of the last round, and "Play again" opens
 * it filled in from one particular round: players, course, games, stakes and
 * teams. Nothing is saved until Start Round, and every rule Start Round
 * checks still applies.
 */

const options = (patch: Partial<GameOptions> = {}): GameOptions => ({
  useNet: false,
  stablefordMode: 'standard',
  loneWolfMultiplier: 2,
  blindWolfMultiplier: 3,
  stakes: {},
  ...patch,
});

const round = (patch: Partial<Round> = {}): Round => ({
  id: 'r1',
  course: 'Sunset Ridge',
  date: '2026-09-01',
  createdAt: 1,
  updatedAt: 1,
  players: [
    { id: 'p1', name: 'Mike', handicap: 8 },
    { id: 'p2', name: 'Dave', handicap: 12 },
    { id: 'p3', name: 'Chris' },
    { id: 'p4', name: 'Tom', handicap: 3 },
  ],
  holes: realCard18(),
  slope: 128,
  rating: 71.4,
  games: ['nassau', 'skins'],
  options: options({
    stakes: { nassau: 5, skins: 2 },
    autoPress: true,
    nassau: { mode: '2v2', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] },
  }),
  scores: {},
  wolf: {},
  status: 'finished',
  ...patch,
});

const store = (rounds: Round[]) => localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));

const summaries = () => [...document.querySelectorAll('.setup-row-summary')].map((el) => el.textContent);
const summaryOf = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.setup-row-head')]
    .find((el) => el.textContent?.includes(label))
    ?.querySelector('.setup-row-summary')?.textContent;
const openRows = () =>
  [...document.querySelectorAll('.setup-row-head')].filter((el) => el.getAttribute('aria-expanded') === 'true');
const names = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of player"]')].map((i) => i.value);

const rowHead = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.setup-row-head')].find((el) => el.textContent?.includes(label))!;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('remembered course', () => {
  it('leaves a first round exactly as it was: no course, two blank players', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    expect(summaryOf('Course')).toBe('Not set');
    expect(names()).toEqual(['', '']);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Same course as last time/)).toBeNull();
  });

  it('opens on the last round’s course, rows closed, and starts on its card', async () => {
    store([round()]);
    const user = userEvent.setup();
    const started: Round[] = [];
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    expect(summaryOf('Course')).toBe('Sunset Ridge');
    expect(openRows()).toHaveLength(0);
    // Only the course is remembered; the players start blank as before.
    expect(names()).toEqual(['', '']);
    // Not a play-again: no status line.
    expect(screen.queryByText(/as last time\. Change anything/)).toBeNull();

    await user.click(screen.getByRole('button', { name: /Same crew/ }));
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started).toHaveLength(1);
    expect(started[0].course).toBe('Sunset Ridge');
    expect(started[0].holes).toEqual(realCard18());
    expect(started[0].slope).toBe(128);
    expect(started[0].rating).toBe(71.4);
  });

  it('does not remember a course when the last regular round had none', () => {
    store([round({ id: 'new', course: undefined }), round({ id: 'old' })]);
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    expect(summaryOf('Course')).toBe('Not set');
  });

  it('“Play somewhere else” clears it back to a blank course and goes to the search field', async () => {
    store([round()]);
    const user = userEvent.setup();
    const started: Round[] = [];
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    await user.click(rowHead('Course'));
    expect(screen.getByText(/Same course as last time/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Play somewhere else' }));
    expect(summaryOf('Course')).toBe('Not set');
    expect(screen.queryByText(/Same course as last time/)).toBeNull();
    expect(rowHead('Course').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(document.querySelector('.course-search input'));

    await user.click(screen.getByRole('button', { name: /Same crew/ }));
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started[0].course).toBeUndefined();
    expect(started[0].holes).toHaveLength(18);
    expect(started[0].holes.every((h) => h.par === 4 && h.strokeIndex === undefined)).toBe(true);
    expect(started[0].slope).toBeUndefined();
    expect(started[0].rating).toBeUndefined();
  });

  it('says the card is still last time’s when another name is typed over it', async () => {
    store([round()]);
    const user = userEvent.setup();
    const started: Round[] = [];
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    await user.click(rowHead('Course'));
    const input = document.querySelector<HTMLInputElement>('.course-search input')!;
    await user.clear(input);
    await user.type(input, 'Oak Hollow');
    expect(screen.queryByText(/Same course as last time/)).toBeNull();
    expect(screen.getByText(/Pars and ratings are still from Sunset Ridge\./)).toBeTruthy();

    // The way out is still there, and clears the old card.
    await user.click(screen.getByRole('button', { name: 'Play somewhere else' }));
    expect(screen.queryByText(/Pars and ratings are still from/)).toBeNull();
    expect(summaryOf('Course')).toBe('Not set');
    expect(document.activeElement).toBe(input);

    // Typing the old name back does not bring the note back: the card is gone.
    await user.type(input, 'Sunset Ridge');
    expect(screen.queryByText(/Same course as last time|Pars and ratings are still/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Same crew/ }));
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started[0].holes.every((h) => h.par === 4)).toBe(true);
    expect(started[0].slope).toBeUndefined();
  });

  it('drops the note once a saved course replaces the card', async () => {
    store([round()]);
    localStorage.setItem(
      'press.courses.v1',
      JSON.stringify([{ id: 'c1', name: 'Oak Hollow', holes: realCard18().map((h) => ({ ...h, par: 3 })) }])
    );
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await user.click(rowHead('Course'));
    const input = document.querySelector<HTMLInputElement>('.course-search input')!;
    await user.type(input, 'x');
    expect(screen.getByText(/Pars and ratings are still from Sunset Ridge/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Oak Hollow/ }));
    expect(summaryOf('Course')).toBe('Oak Hollow');
    expect(screen.queryByText(/Same course as last time|Pars and ratings are still/)).toBeNull();
  });
});

describe('play again', () => {
  it('fills the players, course, games and money, and says so', () => {
    // A later round elsewhere does not change what is played again.
    store([round({ id: 'later', course: 'Elsewhere', games: ['wolf'] }), round()]);
    render(<Setup onCancel={() => {}} onStart={() => {}} again={round()} />);
    expect(screen.getByText(/^Same players, course and games as last time/).textContent).toBe(
      'Same players, course and games as last time. Change anything, then start.'
    );
    // Visible from the start, so not a live region (nothing to announce).
    expect(screen.queryByRole('status')).toBeNull();
    expect(names()).toEqual(['Mike', 'Dave', 'Chris', 'Tom']);
    expect(summaryOf('Course')).toBe('Sunset Ridge');
    expect(summaries()).toContain('Nassau, Skins');
    expect(summaries()).toContain('$5 Nassau · $2 Skins');
    expect(openRows()).toHaveLength(0);
  });

  it('starts a round with the same teams, games, stakes, auto-press and card', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    const again = round();
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} again={again} />);
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started).toHaveLength(1);
    const r = started[0];
    expect(r.id).not.toBe(again.id);
    expect(r.status).toBe('in_progress');
    expect(r.scores).toEqual({});
    expect(r.players.map((p) => p.name)).toEqual(['Mike', 'Dave', 'Chris', 'Tom']);
    expect(r.players.every((p) => !again.players.some((q) => q.id === p.id))).toBe(true);
    // Rated course with no Index: the remembered stroke counts carry over.
    expect(r.players.map((p) => p.handicap ?? 0)).toEqual([8, 12, 0, 3]);
    expect(r.games).toEqual(['nassau', 'skins']);
    expect(r.options.stakes).toEqual({ nassau: 5, skins: 2 });
    expect(r.options.autoPress).toBe(true);
    const nameOf = (id: string) => r.players.find((p) => p.id === id)!.name;
    expect(r.options.nassau!.mode).toBe('2v2');
    expect(r.options.nassau!.teamA.map(nameOf)).toEqual(['Mike', 'Chris']);
    expect(r.options.nassau!.teamB.map(nameOf)).toEqual(['Dave', 'Tom']);
    expect(r.course).toBe('Sunset Ridge');
    expect(r.holes).toEqual(realCard18());
    expect(r.slope).toBe(128);
    expect(r.rating).toBe(71.4);
  });

  it('keeps a back nine and its eighteen-hole rating', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    const back = sliceCourseHoles(realCard18(), 9, { nine: 'back' });
    render(
      <Setup
        onCancel={() => {}}
        onStart={(r) => started.push(r)}
        again={round({ holes: back, ratingHoles: 18 })}
      />
    );
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started[0].holes).toEqual(back);
    expect(started[0].ratingHoles).toBe(18);
    expect(started[0].rating).toBe(71.4);
  });

  it('says only players and games when that round had no course', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} again={round({ course: undefined })} />);
    expect(screen.getByText(/^Same players and games as last time/).textContent).toBe(
      'Same players and games as last time. Change anything, then start.'
    );
    expect(summaryOf('Course')).toBe('Not set');
  });

  it('does not promise a course it cannot load (a seven-hole round from a link)', () => {
    render(
      <Setup onCancel={() => {}} onStart={() => {}} again={round({ holes: realCard18().slice(0, 7) })} />
    );
    expect(summaryOf('Course')).toBe('Not set');
    expect(screen.getByText(/^Same players and games as last time/)).toBeTruthy();
    expect(screen.queryByText(/course and games/)).toBeNull();
  });

  it('keeps the Wolf order: the same players lead off the same holes', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    const again = round({ games: ['wolf'], options: options() });
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} again={again} />);
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    const r = started[0];
    const nameOf = (rd: Round, id: string) => rd.players.find((p) => p.id === id)!.name;
    // The order is the players' order on the card (games/wolf.ts wolfForHole),
    // which the seed keeps: Mike tees off as Wolf on 1, Dave on 2, and so on.
    const wolves = r.holes.map((h) => nameOf(r, r.wolf[h.number].wolfPlayerId));
    expect(wolves.slice(0, 5)).toEqual(['Mike', 'Dave', 'Chris', 'Tom', 'Mike']);
  });

  it('still checks the round before starting it', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    // Two of the four are gone from the card; Wolf needs three.
    render(
      <Setup
        onCancel={() => {}}
        onStart={(r) => started.push(r)}
        again={round({
          players: [
            { id: 'p1', name: 'Mike' },
            { id: 'p2', name: 'Dave' },
          ],
          games: ['wolf'],
          options: options(),
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(started).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toMatch(/Wolf needs at least 3 players/);
  });
});
