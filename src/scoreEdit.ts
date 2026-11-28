import type { Round } from './types';
import { pickedUp } from './games/league';

/**
 * One cell of the card, as the Card's Undo needs to see it: the score and
 * whether it is a league pick-up (an X, stored as a 9 with a flag).
 */
export interface CellState {
  score: number | null;
  x: boolean;
}

export const cellState = (round: Round, holeNumber: number, playerId: string): CellState => ({
  score: round.scores[holeNumber]?.[playerId] ?? null,
  x: pickedUp(round, holeNumber, playerId),
});

export const sameCell = (a: CellState, b: CellState): boolean =>
  a.score === b.score && a.x === b.x;

/** The round's pick-ups with this player's on this hole set or cleared. */
export const pickupsWith = (round: Round, holeNumber: number, playerId: string, on: boolean) => {
  const here = (round.pickups?.[holeNumber] ?? []).filter((id) => id !== playerId);
  const next = { ...(round.pickups ?? {}), [holeNumber]: on ? [...here, playerId] : here };
  if (!next[holeNumber].length) delete next[holeNumber];
  return Object.keys(next).length ? next : undefined;
};

/**
 * Put one cell back as it was: its score and its pick-up flag, nothing else.
 * Not a snapshot of the round, so whatever changed elsewhere since stays.
 */
export function restoreCell(
  round: Round,
  holeNumber: number,
  playerId: string,
  state: CellState
): Round {
  const holeScores = { ...(round.scores[holeNumber] ?? {}), [playerId]: state.score };
  const next: Round = { ...round, scores: { ...round.scores, [holeNumber]: holeScores } };
  const pickups = pickupsWith(round, holeNumber, playerId, state.x);
  if (pickups) next.pickups = pickups;
  else delete next.pickups;
  return next;
}

/** What the cell shows: "5", "X", or a dash for a blank. */
export const cellLabel = (state: CellState): string =>
  state.x ? 'X' : state.score == null ? '–' : String(state.score);

const cellSpoken = (state: CellState): string =>
  state.x ? 'picked up' : state.score == null ? 'no score' : String(state.score);

/** "Mike, hole 5: 5 → 4" */
export const editText = (
  name: string,
  holeNumber: number,
  before: CellState,
  after: CellState
): string => `${name}, hole ${holeNumber}: ${cellLabel(before)} → ${cellLabel(after)}`;

/** "Mike, hole 5 changed from 5 to 4." — the arrow and dash read badly aloud. */
export const editSpoken = (
  name: string,
  holeNumber: number,
  before: CellState,
  after: CellState
): string =>
  `${name}, hole ${holeNumber} changed from ${cellSpoken(before)} to ${cellSpoken(after)}.`;

/** "Mike, hole 5 is back to 5." / "… is back to X." / "… is blank again." */
export const undoneText = (name: string, holeNumber: number, before: CellState): string =>
  before.x || before.score != null
    ? `${name}, hole ${holeNumber} is back to ${cellLabel(before)}.`
    : `${name}, hole ${holeNumber} is blank again.`;

/** The Undo button's name: "Undo: put Mike, hole 5 back to 5". */
export const undoLabel = (name: string, holeNumber: number, before: CellState): string =>
  `Undo: put ${name}, hole ${holeNumber} back to ${
    before.x ? 'X' : before.score == null ? 'blank' : before.score
  }`;
