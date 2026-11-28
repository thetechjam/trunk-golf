// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Results } from './Results';

/**
 * The foot of the Results screen.
 *
 * It had grown to five controls, three of them identical ghost rows: two
 * picture buttons, a text fallback, the round's own link, and an edit that was
 * not sharing at all. What is pinned here is the shape that replaced it — one
 * way out of the screen, the rest grouped in a sheet — and the one behaviour
 * that had to survive losing its button: sharing as text.
 */

vi.mock('../shareCard', () => ({ renderShareCard: vi.fn() }));
vi.mock('../scorecardCard', () => ({ renderScorecardCard: vi.fn() }));
import { renderShareCard } from '../shareCard';

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

const round = (over: Partial<Round> = {}): Round => ({
  id: 'r1',
  course: 'Half Moon Bay',
  date: '2026-09-12',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Al', handicap: 6 },
    { id: 'p2', name: 'Bo', handicap: 12 },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: 5 }])),
  wolf: {},
  status: 'finished',
  ...over,
});

const show = (over: Partial<Round> = {}) =>
  render(
    <Results round={round(over)} onChange={() => {}} onHome={() => {}} onBackToPlay={() => {}} />
  );

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
  });
});
afterEach(cleanup);

describe('the foot of the screen', () => {
  it('offers one way to share, not five', () => {
    show();
    // The guard against this accreting again: anything new belongs in the
    // sheet, not in another row under the boards.
    const foot = screen.getByRole('button', { name: 'Share' });
    expect(foot).toBeTruthy();
    for (const gone of ['Share as text instead', 'Send the round to a phone', 'Share results']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
  });

  it('puts both pictures and the round’s own link in the sheet', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Share results' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Share scorecard' })).toBeTruthy();
    // What each one actually produces, which "Results" and "Scorecard" side by
    // side never said.
    expect(within(sheet).getByText('The scoreboard, as an image')).toBeTruthy();
    expect(within(sheet).getByText('Every hole, as an image')).toBeTruthy();
    // And, below the rule, the round itself.
    expect(within(sheet).getByText(/or send the round itself/i)).toBeTruthy();
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Send the link' })).toBeTruthy()
    );
  });

  it('still falls back to text when a picture cannot be built', async () => {
    // The button for this was dropped because the fallback already fires on
    // its own. That is only true while it actually does.
    vi.mocked(renderShareCard).mockRejectedValueOnce(new Error('no canvas'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Share results' }));

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('Half Moon Bay');
    expect(written[0]).toContain('via Trunk · trunk.golf');
  });
});

describe('editing the numbers that decide the money', () => {
  it('sits with Edit stakes, where the money is', async () => {
    show();
    const settlement = document.querySelector('.settlement')!;
    const head = settlement.querySelector('.board-head')! as HTMLElement;
    expect(within(head).getByRole('button', { name: 'Edit handicaps' })).toBeTruthy();
    expect(within(head).getByRole('button', { name: 'Edit stakes' })).toBeTruthy();

    await userEvent.click(within(head).getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });

  it('is offered even when nobody has a handicap yet', async () => {
    // Which is exactly when you would want it: the way to put one in.
    show({ players: [{ id: 'p1', name: 'Al' }, { id: 'p2', name: 'Bo' }] });
    await userEvent.click(screen.getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });

  it('moves to the league board on a league night, which has no settlement', async () => {
    show({
      games: [],
      options: {
        ...round().options,
        stakes: {},
        league: {
          pointsPerMatch: 3,
          teams: [
            { name: 'The Hackers', aId: 'p1', bId: 'p2' },
            { name: 'Fore Play', aId: 'p1', bId: 'p2' },
          ],
        },
      },
    });
    expect(document.querySelector('.settlement')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });
});

describe('the order of the screen', () => {
  // Bo's 8 is a Snowman, so there is an award to place.
  const withAward = (): Partial<Round> => ({
    scores: { ...round().scores, 1: { p1: 4, p2: 8 } },
  });
  const follows = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('puts who pays whom straight under the hero, then the awards, then the boards', () => {
    const { container } = show(withAward());
    const hero = container.querySelector('.winner-hero');
    const settlement = container.querySelector('.settlement');
    const awards = container.querySelector('.awards');
    const boards = container.querySelector('.boards');
    expect(hero && settlement && awards && boards).toBeTruthy();
    // Nothing between the hero and the money.
    expect(hero!.nextElementSibling).toBe(settlement);
    expect(follows(settlement!, awards!)).toBe(true);
    expect(follows(awards!, boards!)).toBe(true);
  });

  it('keeps the settlement first, with its stakes to fill in, when nothing is at stake', () => {
    const { container } = show({ ...withAward(), options: { ...round().options, stakes: {} } });
    const settlement = container.querySelector('.settlement');
    const awards = container.querySelector('.awards');
    expect(settlement?.textContent).toContain('Set a stake');
    expect(follows(settlement!, awards!)).toBe(true);
  });
});

/**
 * The backup card. It used to open the screen on every finished round, old
 * ones included, above the result people came to read. Now it is asked once,
 * on the round just finished, after who pays whom.
 */
describe('the backup card', () => {
  const follows = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  // The card asks about rounds on this device, so the round has to be kept.
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('press.rounds.v1', JSON.stringify([round()]));
  });
  afterEach(() => localStorage.clear());

  const showFinished = (props: { justFinished?: boolean; unkept?: boolean }, over: Partial<Round> = {}) =>
    render(
      <Results
        round={round(over)}
        onChange={() => {}}
        onHome={() => {}}
        onBackToPlay={() => {}}
        {...props}
      />
    );

  it('is not shown on a round opened from the history', () => {
    const { container } = showFinished({});
    expect(container.querySelector('.keep-rounds')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();
  });

  it('follows the settle-up on the round just finished, ahead of the awards', () => {
    // Bo's 8 is a Snowman, so there is an award to place.
    const { container } = showFinished(
      { justFinished: true },
      { scores: { ...round().scores, 1: { p1: 4, p2: 8 } } }
    );
    const card = container.querySelector('.keep-rounds');
    const settlement = container.querySelector('.settlement');
    const awards = container.querySelector('.awards');
    expect(card && settlement && awards).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeTruthy();
    expect(follows(settlement!, card!)).toBe(true);
    expect(follows(card!, awards!)).toBe(true);
    // Nothing above the result.
    expect(container.querySelector('.results-meta')!.previousElementSibling).toBe(
      container.querySelector('header.bar')
    );
    expect(container.querySelector('.winner-hero')!.nextElementSibling).toBe(settlement);
  });

  it('is not shown on a round that is not kept on this device', () => {
    const { container } = showFinished({ justFinished: true, unkept: true });
    expect(container.querySelector('.keep-rounds')).toBeNull();
  });

  it('comes after the boards on a league night, before Share', () => {
    const { container } = showFinished(
      { justFinished: true },
      {
        games: [],
        options: {
          ...round().options,
          stakes: {},
          league: {
            pointsPerMatch: 3,
            teams: [
              { name: 'The Hackers', aId: 'p1', bId: 'p2' },
              { name: 'Fore Play', aId: 'p1', bId: 'p2' },
            ],
          },
        },
      }
    );
    const card = container.querySelector('.keep-rounds');
    const boards = container.querySelector('.boards');
    const share = container.querySelector('.share-open');
    expect(card && boards && share).toBeTruthy();
    expect(follows(boards!, card!)).toBe(true);
    expect(follows(card!, share!)).toBe(true);
  });
});
