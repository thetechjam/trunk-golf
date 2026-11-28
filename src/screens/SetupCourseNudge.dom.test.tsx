// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Setup } from './Setup';
import type { Round, SavedCourse } from '../types';

/**
 * The note on New Round when handicap strokes are in play and no hole has a
 * stroke index: those strokes fall in hole order, and nothing used to say
 * so. A note, not a block — Start Round still starts.
 */

const NO_COURSE = /^No course set — handicap strokes will fall in hole order\./;
const NO_SI = /^No hole difficulty set — handicap strokes will fall in hole order\./;

const nudge = () =>
  screen.queryByRole('button', { name: /handicap strokes will fall in hole order/ });

const rowHead = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.setup-row-head')].find((el) =>
    el.textContent?.includes(label)
  )!;

beforeEach(() => {
  // Typing a course name searches the course database; answer with nothing.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ courses: [] }) }) as Response)
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function setUp(opts: { handicap?: string; onStart?: (r: Round) => void } = {}) {
  const user = userEvent.setup();
  render(<Setup onCancel={() => {}} onStart={opts.onStart ?? (() => {})} />);
  await user.type(screen.getByLabelText('Name of player 1'), 'Al');
  if (opts.handicap) await user.type(screen.getByLabelText('Handicap for Al'), opts.handicap);
  return user;
}

describe('the course nudge on New Round', () => {
  it('shows with a name and a handicap on Skins, the default game', async () => {
    await setUp({ handicap: '12' });
    expect(nudge()?.textContent).toMatch(NO_COURSE);
    // Not a live region: its wording changes as the course is typed.
    expect(nudge()?.closest('[role="status"], [aria-live]')).toBeNull();
  });

  it('does not show without a handicap', async () => {
    await setUp();
    expect(nudge()).toBeNull();
  });

  it('opens the Course row when tapped', async () => {
    const user = await setUp({ handicap: '12' });
    expect(rowHead('Course').getAttribute('aria-expanded')).toBe('false');
    await user.click(nudge()!);
    expect(rowHead('Course').getAttribute('aria-expanded')).toBe('true');
  });

  it('asks for hole difficulty once a course is named, and opens Holes & pars', async () => {
    const user = await setUp({ handicap: '12' });
    await user.click(nudge()!);
    await user.type(screen.getByLabelText(/Course \(optional\)/), 'Home Muni');
    await waitFor(() => expect(nudge()?.textContent).toMatch(NO_SI));
    expect(rowHead('Holes & pars').getAttribute('aria-expanded')).toBe('false');
    await user.click(nudge()!);
    expect(rowHead('Holes & pars').getAttribute('aria-expanded')).toBe('true');
    // The stroke-index editor is opened for them.
    await waitFor(() => expect(screen.getByLabelText('Stroke index for hole 1')).toBeTruthy());
    // Opening it seeds 1..N in hole order, which places the strokes no
    // differently, so the note stays until an index is changed.
    expect(nudge()?.textContent).toMatch(NO_SI);
    const si1 = screen.getByLabelText('Stroke index for hole 1');
    const si2 = screen.getByLabelText('Stroke index for hole 2');
    await user.clear(si1);
    await user.type(si1, '2');
    await user.clear(si2);
    await user.type(si2, '1');
    await waitFor(() => expect(nudge()).toBeNull());
  });

  it('goes away when a saved course with stroke indexes is loaded', async () => {
    const saved: SavedCourse = {
      id: 's1',
      name: 'Home Muni',
      // Not 1..9 in hole order: that places the strokes no differently from
      // having no indexes at all, so the note would stay.
      holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: 9 - i })),
    };
    localStorage.setItem('press.courses.v1', JSON.stringify([saved]));
    const user = await setUp({ handicap: '12' });
    expect(nudge()).not.toBeNull();
    await user.click(nudge()!);
    await user.click(await screen.findByText('Home Muni'));
    await waitFor(() => expect(nudge()).toBeNull());
  });

  it('does not show when Stroke Play is the only game', async () => {
    const user = await setUp({ handicap: '12' });
    if (rowHead('Games').getAttribute('aria-expanded') !== 'true')
      await user.click(rowHead('Games'));
    await user.click(screen.getByRole('button', { name: 'Stroke Play', pressed: false }));
    await user.click(screen.getByRole('button', { name: 'Skins', pressed: true }));
    expect(nudge()).toBeNull();
  });

  it('does not stop the round starting', async () => {
    const started: Round[] = [];
    const user = await setUp({ handicap: '12', onStart: (r) => started.push(r) });
    await user.type(screen.getByLabelText('Name of player 2'), 'Bo');
    expect(nudge()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(screen.queryByRole('alert')?.textContent ?? null).toBeNull();
    expect(started).toHaveLength(1);
  });
});
