// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Setup } from './Setup';
import type { Round, SavedCourse } from '../types';

/**
 * The note on New Round when handicap strokes are in play and no hole has a
 * stroke index: those strokes fall on holes 1, 2, 3… in order, and nothing
 * used to say so. A note, not a block — Start Round still starts.
 */

const NO_COURSE = /^No course set — handicap strokes will fall on holes 1, 2, 3…/;
const NO_SI = /^No hole difficulty set — handicap strokes will fall on holes 1, 2, 3…/;

const nudge = () => screen.queryByRole('button', { name: /handicap strokes will fall on holes/ });

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
    expect(nudge()?.closest('.course-nudge')?.getAttribute('role')).toBe('status');
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
  });

  it('goes away when a saved course with stroke indexes is loaded', async () => {
    const saved: SavedCourse = {
      id: 's1',
      name: 'Home Muni',
      holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
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
