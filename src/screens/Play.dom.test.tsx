// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, within, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Play } from './Play';
import { holes18, makeRound, player, scrambleRound } from '../games/testFixtures';

/**
 * A scramble on the Play screen: crediting a shot reaches the round, and the
 * banner that already asks about blank scores and missing Wolf calls asks
 * about tee shots too — at the two moments it matters.
 */

const teams = [
  { id: 't1', name: 'Hackers', members: ['Jesse', 'Sam'] },
  { id: 't2', name: 'Fore Play', members: ['Al', 'Bo'] },
];
const nine = holes18().slice(0, 9);
const everyHole = (s: number) =>
  Object.fromEntries(nine.map((h) => [h.number, { t1: s, t2: s }]));

/** Keeps every change, as App does, and reports the latest round. */
function show(start: Round) {
  let latest = start;
  let finished = 0;
  function Harness() {
    const [round, setRound] = useState(start);
    return (
      <Play
        round={round}
        onChange={(r) => {
          latest = r;
          setRound(r);
        }}
        onFinish={() => (finished += 1)}
        onExit={() => {}}
      />
    );
  }
  render(<Harness />);
  return { latest: () => latest, finished: () => finished };
}

const banner = () => screen.getByRole('alert');

afterEach(cleanup);

describe('scramble shots on the Hole tab', () => {
  it('credits a tee shot to the round, under the team it belongs to', async () => {
    const user = userEvent.setup();
    const play = show(scrambleRound({ teams, holes: nine }));
    const t2 = document.getElementById('player-row-t2')!;
    await user.click(within(t2).getByRole('button', { name: 'Tee shot, Bo' }));
    expect(play.latest().shots).toEqual({ 1: { t2: [1] } });
    await user.click(within(t2).getByRole('button', { name: 'Tee shot, Bo' }));
    expect(play.latest().shots).toBeUndefined();
  });

  it('has no shot rows outside a scramble', () => {
    show({ ...scrambleRound({ teams, holes: nine }), options: { stakes: {} } as Round['options'] });
    expect(screen.queryByRole('button', { name: /^Tee shot/ })).toBeNull();
  });
});

describe('the warning banner', () => {
  it('asks on Next when a team has scored the hole with no tee shot picked', async () => {
    const user = userEvent.setup();
    const round = scrambleRound({
      teams,
      holes: nine,
      minDrives: 1,
      scores: { 1: { t1: 4, t2: 4 } },
      shots: { 1: { t1: [0] } },
    });
    const play = show(round);
    await user.click(screen.getByRole('button', { name: /^Hole 1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(banner().textContent).toContain(
      'No tee shot picked for Fore Play. Move to the next hole anyway?'
    );

    // Keep scoring stays here: the scores are in, the drive is what is missing.
    await user.click(screen.getByRole('button', { name: 'Keep scoring' }));
    expect(screen.getByText('Hole 1')).toBeTruthy();
    expect(document.getElementById('player-row-t2')!.className).toContain('highlight');

    // Picking it clears the question.
    const t2 = document.getElementById('player-row-t2')!;
    await user.click(within(t2).getByRole('button', { name: /^Tee shot, Al/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Hole 2')).toBeTruthy();
    expect(play.latest().shots?.[1]).toEqual({ t1: [0], t2: [0] });
  });

  it('lists teams with "and", since a default team name has a comma in it', async () => {
    const user = userEvent.setup();
    const round = scrambleRound({
      teams: [
        { name: 'Jesse, Sam & 2 more', members: ['Jesse', 'Sam', 'Al', 'Bo'] },
        { name: 'Cy & Di', members: ['Cy', 'Di'] },
      ],
      holes: nine,
      minDrives: 1,
      scores: { 1: { t1: 4, t2: 4 } },
    });
    show(round);
    await user.click(screen.getByRole('button', { name: /^Hole 1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(banner().textContent).toContain('No tee shot picked for Jesse, Sam & 2 more and Cy & Di.');
  });

  it('does not ask about tee shots when there is no minimum', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine, scores: { 1: { t1: 4, t2: 4 } } }));
    await user.click(screen.getByRole('button', { name: /^Hole 1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says on Finish which team is short of the minimum, and who owes it', async () => {
    const user = userEvent.setup();
    const round = scrambleRound({
      teams,
      holes: nine,
      minDrives: 2,
      scores: everyHole(4),
      // Hackers used Jesse twice and Sam twice; Fore Play only ever used Al.
      shots: {
        1: { t1: [0], t2: [0] },
        2: { t1: [0], t2: [0] },
        3: { t1: [1], t2: [0] },
        4: { t1: [1], t2: [0] },
      },
    });
    const play = show(round);
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(banner().textContent).toContain(
      'Fore Play: tee-shot minimum not met (Bo 2). Finish the round anyway?'
    );
    expect(banner().textContent).not.toContain('Hackers');
    expect(banner().textContent).not.toContain('missing scores');

    // Every score is in, so Keep scoring opens the first hole Fore Play
    // played without picking a drive.
    await user.click(screen.getByRole('button', { name: 'Keep scoring' }));
    expect(screen.getByText('Hole 5')).toBeTruthy();
    expect(document.getElementById('player-row-t2')!.className).toContain('highlight');

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await user.click(screen.getByRole('button', { name: 'Finish anyway' }));
    expect(play.finished()).toBe(1);
  });

  it('composes with the missing-scores sentence', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [teams[0]], holes: nine, minDrives: 1 }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(banner().textContent).toContain(
      '9 holes are missing scores. Hackers: tee-shot minimum not met (Jesse 1, Sam 1). Finish the round anyway?'
    );
  });
});

describe('the view tabs and the hole strip, to a screen reader', () => {
  it('says which of Hole, Board and Card is open', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine }));
    const pressed = () =>
      ['Hole', 'Board', 'Card'].map((name) =>
        screen.getByRole('button', { name }).getAttribute('aria-pressed')
      );
    expect(pressed()).toEqual(['true', 'false', 'false']);
    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(pressed()).toEqual(['false', 'true', 'false']);
  });

  it('names the hole dots as a group', () => {
    show(scrambleRound({ teams, holes: nine }));
    const strip = screen.getByRole('group', { name: 'Hole progress' });
    expect(within(strip).getAllByRole('button')).toHaveLength(9);
  });
});

describe('the Board tab', () => {
  it('follows the Scramble board with the tee shots, and has no money card for one team', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [teams[0]], holes: nine, minDrives: 1 }));
    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.queryByText(/No money on this round/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Tee shots' })).toBeTruthy();
  });

  it('calls the stake Scramble, per team, on the money card and in its editor', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine, stake: 5, scores: everyHole(4) }));
    await user.click(screen.getByRole('button', { name: 'Board' }));
    const money = document.getElementById('board-money')!;
    expect(within(money).getByText('$5 per team')).toBeTruthy();
    expect(within(money).queryByText(/Stroke Play|low round/)).toBeNull();
    await user.click(within(money).getByRole('button', { name: 'Edit stakes' }));
    expect(within(money).getAllByText('Scramble').length).toBeGreaterThan(0);
    expect(within(money).getByText('per team')).toBeTruthy();
  });

  it('jumps to the tee shots once there are three cards', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine, stake: 5 }));
    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByRole('button', { name: 'Tee shots' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tee shots, Hackers' }).id).toBe('board-tee-shots');
  });
});

describe('fixing a score on the Card', () => {
  const four = [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy'), player('p4', 'Di')];
  // Finished, so Play opens on the Card. Hole 1 is a par 4.
  const finished = (): Round =>
    makeRound({
      players: four,
      holes: nine,
      status: 'finished',
      scores: { 1: { p1: 5, p2: 4, p3: 3, p4: 6 }, 2: { p1: 4 } },
    });
  const league = (): Round =>
    makeRound({
      players: four,
      holes: nine,
      status: 'finished',
      options: {
        league: {
          pointsPerMatch: 1,
          teams: [
            { aId: 'p1', bId: 'p2' },
            { aId: 'p3', bId: 'p4' },
          ],
        },
      },
      scores: { 1: { p1: 9, p2: 4, p3: 5, p4: 4 } },
      pickups: { 1: ['p1'] },
    });

  const cell = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
  const chip = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
  const toast = () => document.querySelector('.play-foot .edit-toast');
  const spoken = () => document.querySelector('.play-foot [role="status"]')!.textContent;
  const undo = () => screen.queryByRole('button', { name: /^Undo: / });

  afterEach(() => vi.useRealTimers());

  it('keeps the new score and offers it back: the row shows it, a screen reader hears it', () => {
    const play = show(finished());
    cell(/^Al, hole 1, 5/);
    chip('4, Par');
    expect(play.latest().scores[1].p1).toBe(4);
    expect(toast()?.textContent).toContain('Al, hole 1: 5 → 4');
    expect(spoken()).toBe('Al, hole 1 changed from 5 to 4.');
    expect(undo()?.getAttribute('aria-label')).toBe('Undo: put Al, hole 1 back to 5');
    // In the foot, above the button it must never cover.
    const foot = document.querySelector('.play-foot')!;
    const back = screen.getByRole('button', { name: 'Back to results →' });
    expect(foot.contains(toast())).toBe(true);
    expect(toast()!.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Undo puts that one cell back, says so, and drops its button for the row', () => {
    const play = show(finished());
    cell(/^Al, hole 1, 5/);
    chip('4, Par');
    fireEvent.click(undo()!);
    expect(play.latest().scores[1].p1).toBe(5);
    expect(toast()?.textContent).toBe('Al, hole 1 is back to 5.');
    expect(spoken()).toBe('Al, hole 1 is back to 5.');
    expect(undo()).toBeNull();
    expect(document.activeElement).toBe(toast());
  });

  it('Undo restores the cell only, not the round as it was', () => {
    const play = show(finished());
    cell(/^Al, hole 1, 5/);
    chip('4, Par');
    cell(/^Bo, hole 2/);
    chip('3, Birdie');
    // Only the latest edit is offered back; the first one stays.
    fireEvent.click(undo()!);
    expect(play.latest().scores[2].p2).toBeNull();
    expect(play.latest().scores[1].p1).toBe(4);
    expect(toast()?.textContent).toBe('Bo, hole 2 is blank again.');
  });

  it('a cleared score reads as a dash, and comes back on Undo', () => {
    const play = show(finished());
    cell(/^Al, hole 1, 5/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear score' }));
    expect(play.latest().scores[1].p1).toBeNull();
    expect(toast()?.textContent).toContain('Al, hole 1: 5 → –');
    expect(spoken()).toBe('Al, hole 1 changed from 5 to no score.');
    fireEvent.click(undo()!);
    expect(play.latest().scores[1].p1).toBe(5);
  });

  it('league: an X fixed to a 5, then undone, is an X again — the 9 and the pick-up both', () => {
    const play = show(league());
    cell(/^Al, hole 1, picked up/);
    chip('5, Bogey');
    expect(play.latest().scores[1].p1).toBe(5);
    expect(play.latest().pickups).toBeUndefined();
    expect(toast()?.textContent).toContain('Al, hole 1: X → 5');
    fireEvent.click(undo()!);
    expect(play.latest().scores[1].p1).toBe(9);
    expect(play.latest().pickups).toEqual({ 1: ['p1'] });
    expect(toast()?.textContent).toBe('Al, hole 1 is back to X.');
  });

  it('league: the Card can set an X', () => {
    const play = show(league());
    cell(/^Bo, hole 1, 4/);
    fireEvent.click(screen.getByRole('button', { name: /^More scores for Bo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Picked up — X, forfeits the hole' }));
    expect(play.latest().scores[1].p2).toBe(9);
    expect(play.latest().pickups).toEqual({ 1: ['p1', 'p2'] });
    expect(toast()?.textContent).toContain('Bo, hole 1: 4 → X');
    expect(spoken()).toBe('Bo, hole 1 changed from 4 to picked up.');
  });

  it('a cell opened and closed with nothing changed says nothing and saves nothing', async () => {
    const start = league();
    const play = show(start);
    cell(/^Al, hole 1, picked up/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    // Re-tapping the selected chip is "it was right" — no change either.
    cell(/^Bo, hole 1, 4/);
    chip('4, Par');
    expect(play.latest()).toBe(start);
    expect(toast()).toBeNull();
    expect(spoken()).toBe('');
  });

  it('switching tabs clears the row', () => {
    show(finished());
    cell(/^Al, hole 1, 5/);
    chip('4, Par');
    expect(toast()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(toast()).toBeNull();
  });

  it('the row goes by itself: 8s for the edit, 4s for the "back to" line', () => {
    vi.useFakeTimers();
    show(finished());
    cell(/^Al, hole 1, 5/);
    chip('4, Par');
    act(() => vi.advanceTimersByTime(7900));
    expect(toast()).not.toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(toast()).toBeNull();

    cell(/^Al, hole 1, 4/);
    chip('6, Double');
    fireEvent.click(undo()!);
    act(() => vi.advanceTimersByTime(3900));
    expect(toast()?.textContent).toBe('Al, hole 1 is back to 4.');
    act(() => vi.advanceTimersByTime(100));
    expect(toast()).toBeNull();
  });
});
