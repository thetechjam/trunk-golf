// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HelpSheet } from './HelpSheet';

afterEach(cleanup);

describe('the opening of How to Play', () => {
  it('starts with the basics, with no video link above them', () => {
    // The walkthrough video (youtu.be/YDgTmnR_1eo) was deleted from YouTube
    // on 2026-11-20, so its row came out rather than point at nothing. When a
    // new walkthrough exists it goes back in with its own test; until then the
    // only link out of this sheet is the OpenStreetMap credit.
    const { container } = render(<HelpSheet onBack={() => {}} />);
    expect(container.querySelector('.help-sheet > :nth-child(2)')?.textContent).toMatch(/^The basics/);
    expect(screen.queryByRole('link', { name: /walkthrough|watch/i })).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtu\.?be/i);
    const links = screen.getAllByRole('link').map((a) => new URL(a.getAttribute('href')!).hostname);
    expect(links).toEqual(['www.openstreetmap.org']);
  });
});

describe('the trips section', () => {
  it('explains trips, between the games and the league', () => {
    render(<HelpSheet onBack={() => {}} />);
    const trips = screen.getByRole('heading', { name: 'Trips' });
    const games = screen.getByRole('heading', { name: 'Games' });
    const league = screen.getByRole('heading', { name: 'Golf League' });
    expect(games.compareDocumentPosition(trips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trips.compareDocumentPosition(league) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trips.closest('section')?.textContent).toMatch(/settle the money once/);
  });
});

describe('the stakes sentence', () => {
  it('says a stake is typed on the game’s tile, with no Money row', () => {
    const { container } = render(<HelpSheet onBack={() => {}} />);
    const para = [...container.querySelectorAll('p')].find((p) =>
      p.querySelector('strong')?.textContent === 'stake'
    );
    expect(para?.textContent?.replace(/\s+/g, ' ')).toMatch(
      /^Type a stake on a game's tile and Trunk keeps a running total/
    );
    expect(para?.closest('section')?.textContent).not.toMatch(/Money row/);
  });
});

describe('the Trips section', () => {
  it('points to Trip on Home and Add to a trip in New Round, not a Trip row', () => {
    render(<HelpSheet onBack={() => {}} />);
    const text = screen
      .getByRole('heading', { name: 'Trips' })
      .closest('section')
      ?.textContent?.replace(/\s+/g, ' ');
    expect(text).toMatch(/Add to a trip/);
    expect(text).toMatch(/Tap Trip on Home/);
    // Mid-round the Trip row is folded away, so Help says where it lives.
    expect(text).toMatch(/Trip on Home \(under Or start something else\)/);
    expect(text).not.toMatch(/Trip row/);
  });
});
