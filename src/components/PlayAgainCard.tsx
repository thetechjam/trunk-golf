import type { Round } from '../types';
import { playAgainLines } from '../playAgain';

/**
 * Home's offer to set up the last round again: same course, same crew, same
 * games and money, on a New Round screen that is already filled in.
 *
 * Quiet on purpose — an outlined card, not a filled button — so Start New
 * Round stays the one primary on Home. Course and names share one line: an
 * element reading only the course name would make "the course" ambiguous on
 * a Home that also lists that round below.
 *
 * The spaces between the lines are for the accessible name ("Play again
 * Sunset Ridge · … $5 Nassau"); the lines are blocks, so they show nothing.
 */
export function PlayAgainCard({ round, onPlay }: { round: Round; onPlay: () => void }) {
  const { who, games } = playAgainLines(round);
  return (
    <button className="play-again" onClick={onPlay}>
      <span className="play-again-text">
        <span className="play-again-eyebrow">Play again</span>{' '}
        <span className="play-again-who">{who}</span>{' '}
        <span className="play-again-games">{games}</span>
      </span>
      <span className="play-again-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
