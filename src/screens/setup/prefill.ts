import type { Player, Round, TeamSetup } from '../../types';
import type { Assign } from '../../components/TeamPicker';
import type { SidePick } from './GamesSection';
import { uid } from '../../storage';

/** Rounds New Round learns from: not a league night, not a scramble. */
const regular = (r: Round) => !r.options.league && !r.options.scramble;

/**
 * The round whose course New Round opens on: the most recent regular round,
 * and only when it has a course name. A last round played without one leaves
 * the course blank, as does having no rounds at all — so a first round is set
 * up exactly as it always was.
 *
 * Rounds are newest first, as `listRounds()` returns them.
 */
export function lastCourseRound(rounds: Round[]): Round | null {
  const last = rounds.find(regular);
  return last && last.course?.trim() ? last : null;
}

/** The picker state for one game's sides, without the mode (see `lastSetup`). */
export type SeedPick = Omit<SidePick, 'mode'>;

export interface Seed {
  players: Player[];
  nassau: SeedPick;
  match: SeedPick;
  vegasAssign: Assign;
}

const blankPick = (): SeedPick => ({ sideA: '', sideB: '', assign: {} });

/**
 * What "Play again" fills New Round's players and team pickers with.
 *
 * The players come back in the same order with their handicaps and Indexes,
 * under new ids — two rounds must never share a player id. The teams name
 * the old ids, so they are mapped across into the pickers' own state; a team
 * that names someone not on the card is dropped and the picker falls back to
 * its usual default, rather than half-applying it.
 */
export function seedFrom(round: Round, newId: () => string = uid): Seed {
  const ids = new Map<string, string>();
  const players: Player[] = [];
  for (const p of round.players) {
    const name = p.name.trim();
    if (!name) continue;
    const id = newId();
    ids.set(p.id, id);
    players.push({
      id,
      name,
      ...(p.handicap === undefined ? {} : { handicap: p.handicap }),
      ...(p.index === undefined ? {} : { index: p.index }),
    });
  }

  const pick = (t: TeamSetup | undefined): SeedPick => {
    if (!t) return blankPick();
    const all = [...t.teamA, ...t.teamB];
    if (all.length === 0 || all.some((id) => !ids.has(id))) return blankPick();
    if (t.mode === '2v2') {
      const assign: Assign = {};
      // Everyone gets an explicit place: the picker's default puts the first
      // four into teams by position, which is not where a fifth player was.
      for (const p of round.players) {
        const id = ids.get(p.id);
        if (!id) continue;
        assign[id] = t.teamA.includes(p.id) ? 'A' : t.teamB.includes(p.id) ? 'B' : '-';
      }
      return { sideA: '', sideB: '', assign };
    }
    return { sideA: ids.get(t.teamA[0]) ?? '', sideB: ids.get(t.teamB[0]) ?? '', assign: {} };
  };

  const vegas = round.options.vegas;
  return {
    players,
    nassau: pick(round.options.nassau),
    match: pick(round.options.matchPlay),
    vegasAssign: vegas && vegas.mode === '2v2' ? pick(vegas).assign : {},
  };
}
