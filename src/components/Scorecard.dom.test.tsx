// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { JunkClaims, Round } from '../types';
import { Scorecard } from './Scorecard';
import { makeRound, player, holes18 } from '../games/testFixtures';

/**
 * The junk footer under the grid.
 *
 * What the footer says is `buildScorecard`'s job and is tested there. What is
 * here is that it reaches the screen at all, and that it does not appear on a
 * card with nothing to put in it — an empty "Junk" heading under every
 * scorecard would be a worse card than the one before the footer existed.
 */

const four = [
  player('p1', 'Al'),
  player('p2', 'Bo'),
  player('p3', 'Cy'),
  player('p4', 'Di'),
];

const claims: JunkClaims = {
  3: { p1: ['greenie'] },
  7: { p1: ['barkie', 'sandie'], p2: ['chipIn'] },
};

const show = (o: Partial<Parameters<typeof makeRound>[0]> = {}) => {
  const round: Round = makeRound({
    players: four,
    holes: holes18(),
    games: ['junk'],
    junk: claims,
    ...o,
  });
  return render(<Scorecard round={round} />);
};

afterEach(cleanup);

describe('the junk footer', () => {
  it('writes one line per player who claimed something', () => {
    show();
    const lines = [...document.querySelectorAll('.sc-junk li')].map((li) => li.textContent);
    expect(lines).toEqual(['AlGreenie (3rd) · Sandie + Barkie (7th)', 'BoChip-in (7th)']);
  });

  it('sits under the grid rather than inside it, so no column has to hold it', () => {
    show();
    expect(document.querySelector('.scorecard .sc-junk')).toBeNull();
    const foot = document.querySelector('.sc-junk');
    const card = document.querySelector('.card-scroll');
    expect(foot && card && card.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('comes before the key, because it is the round and the key is a note about it', () => {
    show();
    const foot = document.querySelector('.sc-junk')!;
    const legend = document.querySelector('.sc-legend')!;
    expect(foot.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stays off a card with no claims on it', () => {
    show({ junk: undefined });
    expect(document.querySelector('.sc-junk')).toBeNull();
  });

  it('stays off a card for a round that is not playing junk', () => {
    show({ games: ['skins'] });
    expect(document.querySelector('.sc-junk')).toBeNull();
  });
});

describe('the nine switch', () => {
  const holeHeads = () =>
    [...document.querySelectorAll('.sc-hole')].map((th) => Number(th.textContent));

  it('opens an unfinished card on the nine being played', () => {
    render(<Scorecard round={makeRound({ players: four, holes: holes18() })} currentHole={12} />);
    expect(holeHeads()).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(document.querySelector('.sc-nine')?.textContent).toBe('IN');
  });

  it('opens a finished card on all eighteen', () => {
    render(
      <Scorecard round={makeRound({ players: four, holes: holes18(), status: 'finished' })} />
    );
    expect(holeHeads()).toHaveLength(18);
  });

  it('switches nines on a tap', async () => {
    const { getByRole } = render(
      <Scorecard round={makeRound({ players: four, holes: holes18() })} currentHole={3} />
    );
    expect(holeHeads()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    getByRole('button', { name: 'Back 9' }).click();
    await Promise.resolve();
    expect(holeHeads()[0]).toBe(10);
  });

  it('is not offered on a nine-hole card', () => {
    render(<Scorecard round={makeRound({ players: four, holes: holes18().slice(0, 9) })} />);
    expect(document.querySelector('.sc-view')).toBeNull();
    expect(holeHeads()).toHaveLength(9);
  });
});

describe('a nine on its own', () => {
  // At phone width a nine still scrolled sideways, so a nine swaps the
  // written name for the badge and folds +/− under Tot.
  it('draws badges and one total column, and keeps the names for screen readers', () => {
    render(<Scorecard round={makeRound({ players: four, holes: holes18(), status: 'in_progress' })} />);
    const table = document.querySelector('.scorecard')!;
    expect(table.classList.contains('compact')).toBe(true);
    expect(table.querySelectorAll('thead tr:first-child th.sc-total')).toHaveLength(1);
    const first = table.querySelector('tbody th.sc-name')!;
    expect(first.querySelector('.avatar')?.textContent).toBe('AL');
    expect(first.querySelector('.sr-only')?.textContent).toBe('Al');
  });

  it('keeps the full layout for all eighteen', () => {
    show({ status: 'finished' });
    const table = document.querySelector('.scorecard')!;
    expect(table.classList.contains('compact')).toBe(false);
    expect(table.querySelectorAll('thead tr:first-child th.sc-total')).toHaveLength(2);
    expect(table.querySelector('tbody .sc-name-text')?.textContent).toBe('Al');
  });
});

describe('editing a cell', () => {
  // Nine holes, so every cell is on screen; hole 1 is a par 4.
  const nine = holes18().slice(0, 9);
  const plain = (): Round =>
    makeRound({
      players: four,
      holes: nine,
      scores: { 1: { p1: 5, p2: 4, p3: 3 } },
    });
  const leagueRound = (): Round =>
    makeRound({
      players: four,
      holes: nine,
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
  const mount = (round: Round, withPickup = false) => {
    const scores: unknown[] = [];
    const pickups: unknown[] = [];
    render(
      <Scorecard
        round={round}
        onScore={(...a) => scores.push(a)}
        onPickup={withPickup ? (...a) => pickups.push(a) : undefined}
      />
    );
    return { scores, pickups };
  };
  const open = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
  const sheet = () => document.querySelector('dialog');
  const more = () => fireEvent.click(screen.getByRole('button', { name: /^More scores for/ }));
  const overflow = () =>
    [...screen.getByRole('group', { name: /^All scores for/ }).querySelectorAll('button')].map(
      (b) => b.textContent
    );

  it('opens a sheet named for the player, hole and par, with chips and no field to type in', () => {
    mount(plain());
    open(/^Bo, hole 1, 4/);
    expect(sheet()?.getAttribute('aria-label')).toBe('Bo · Hole 1 · Par 4');
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Bo · Hole 1 · Par 4');
    expect(screen.getByRole('radiogroup', { name: "Bo's score, par 4" })).toBeTruthy();
    expect(document.querySelector('input')).toBeNull();
  });

  it('one chip is the whole entry: a 4 fixed to 5 is 5, never 45, and the sheet closes', () => {
    const { scores } = mount(plain());
    open(/^Bo, hole 1, 4/);
    fireEvent.click(screen.getByRole('radio', { name: '5, Bogey' }));
    expect(scores).toEqual([[1, 'p2', 5]]);
    expect(sheet()).toBeNull();
  });

  it('re-tapping the score already there commits nothing — it was right — and closes', () => {
    const { scores } = mount(plain());
    open(/^Bo, hole 1, 4/);
    fireEvent.click(screen.getByRole('radio', { name: '4, Par' }));
    expect(scores).toEqual([]);
    expect(sheet()).toBeNull();
  });

  it('fills a blank cell', () => {
    const { scores } = mount(plain());
    open(/^Di, hole 1, no score/);
    fireEvent.click(screen.getByRole('radio', { name: '3, Birdie' }));
    expect(scores).toEqual([[1, 'p4', 3]]);
  });

  it('commits nothing when closed with ✕ — so a league X stays an X', async () => {
    const { scores, pickups } = mount(leagueRound(), true);
    open(/^Al, hole 1, picked up/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(sheet()).toBeNull());
    expect(scores).toEqual([]);
    expect(pickups).toEqual([]);
  });

  it('turns an X into a real 9 when the 9 under it is tapped', () => {
    const { scores } = mount(leagueRound(), true);
    open(/^Al, hole 1, picked up/);
    more();
    fireEvent.click(screen.getByRole('button', { name: '9, +5' }));
    expect(scores).toEqual([[1, 'p1', 9]]);
    expect(sheet()).toBeNull();
  });

  it('offers 1–9 and an X on a league card, and the X goes to onPickup', () => {
    const { scores, pickups } = mount(leagueRound(), true);
    open(/^Bo, hole 1, 4/);
    more();
    expect(overflow()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'X · picked up']);
    fireEvent.click(screen.getByRole('button', { name: /^Picked up — X/ }));
    expect(pickups).toEqual([[1, 'p2']]);
    expect(scores).toEqual([]);
    expect(sheet()).toBeNull();
  });

  it('offers no X on a league card when there is nothing to take it', () => {
    mount(leagueRound());
    open(/^Bo, hole 1, 4/);
    more();
    expect(overflow()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('offers 1–15 and no X on an ordinary card, even given onPickup', () => {
    mount(plain(), true);
    open(/^Bo, hole 1, 4/);
    more();
    expect(overflow()).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
  });

  it('clears a score with its own button, which a blank cell does not show', () => {
    const { scores } = mount(plain());
    open(/^Bo, hole 1, 4/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear score' }));
    expect(scores).toEqual([[1, 'p2', null]]);
    expect(sheet()).toBeNull();

    open(/^Di, hole 1, no score/);
    expect(screen.queryByRole('button', { name: 'Clear score' })).toBeNull();
  });

  it('clears an X too', () => {
    const { scores } = mount(leagueRound(), true);
    open(/^Al, hole 1, picked up/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear score' }));
    expect(scores).toEqual([[1, 'p1', null]]);
  });

  it('opens nothing on a card that cannot be edited', () => {
    render(<Scorecard round={plain()} />);
    open(/^Bo, hole 1, 4/);
    expect(sheet()).toBeNull();
  });
});

describe('the edit hint', () => {
  it('says the cells can be tapped, between the grid and the key', () => {
    const round = makeRound({ players: four, holes: holes18(), games: ['junk'], junk: claims });
    render(<Scorecard round={round} onScore={() => {}} />);
    const hint = screen.getByText('Tap a score to edit');
    const card = document.querySelector('.card-scroll')!;
    const junk = document.querySelector('.sc-junk')!;
    const key = document.querySelector('.sc-legend')!;
    expect(card.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(junk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not there when the card cannot be edited', () => {
    show();
    expect(screen.queryByText('Tap a score to edit')).toBeNull();
  });
});
