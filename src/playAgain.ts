import type { Round } from './types';
import { gameMeta } from './games';
import { formatMoney } from './games/settlement';
import { isScramble } from './games/scramble';
import { crewNames, liveRound } from './roundSummary';

/**
 * The round Home offers to play again, if any: the newest finished regular
 * round — not a league night or a scramble, which have their own setup
 * screens — with games on it and somebody named on the card.
 *
 * Never alongside a live round: mid-round the Resume card is the thing to
 * press, and two cards each offering a round would be two answers to one
 * question. A card abandoned more than a day ago is not live, so it does not
 * hold the offer back. `rounds` is in `listRounds` order, newest first.
 */
export function playAgainRound(rounds: Round[], now = Date.now()): Round | null {
  if (liveRound(rounds, now)) return null;
  return (
    rounds.find(
      (r) =>
        r.status === 'finished' &&
        !r.options.league &&
        !isScramble(r) &&
        r.games.length > 0 &&
        r.players.some((p) => p.name.trim() !== '')
    ) ?? null
  );
}

/**
 * The card's two lines: where and who ("Sunset Ridge · Mike, Dave & Tom"),
 * and what for ("$5 Nassau · $2 Skins", or "Nassau, Skins" with nothing
 * riding on it). Stakes are read only for games on the round: a game dropped
 * at setup can leave its stake behind in the options.
 *
 * The course is named only when New Round can load it — a nine or an
 * eighteen (see `courseStateFromRound`); a round of another length, which
 * can arrive by link, would promise a course that opens as "Not set".
 */
export function playAgainLines(round: Round): { who: string; games: string } {
  const n = round.holes.length;
  const course = n === 9 || n === 18 ? round.course?.trim() : undefined;
  const who = [course, crewNames(round.players.map((p) => p.name))]
    .filter(Boolean)
    .join(' · ');
  const stakes = round.options.stakes ?? {};
  const staked = round.games.filter((g) => (stakes[g] ?? 0) > 0);
  const games =
    staked.length > 0
      ? staked.map((g) => `${formatMoney(stakes[g] as number)} ${gameMeta(g).label}`).join(' · ')
      : round.games.map((g) => gameMeta(g).label).join(', ');
  return { who, games };
}
