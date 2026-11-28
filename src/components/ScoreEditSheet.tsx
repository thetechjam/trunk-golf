import { Sheet } from './Sheet';
import { ScoreChips } from './ScoreChips';

interface Props {
  name: string;
  holeNumber: number;
  par: number;
  score: number | null;
  /** League only: this cell is an X. Its score is the 9 stored under it. */
  pickedUp: boolean;
  /** Highest score offered behind "…" (a league hole tops out at 9). */
  max?: number;
  /** null clears the score (and any X). */
  onScore: (value: number | null) => void;
  /** League only: toggle the X. Absent, the "X · picked up" chip is not offered. */
  onPickup?: () => void;
  onClose: () => void;
}

/**
 * Fixes one cell of the Card with the Hole tab's chip pad.
 *
 * It replaced a number field that opened with the old score in it, so typing
 * "4" over a 5 gave 54, which was then clamped to 15 without a word. A chip
 * can only be a legal score, and one tap is the whole entry.
 *
 * One tap commits and closes; there is no Save. Re-tapping the selected chip
 * means "it was right", not "clear it" as on the Hole tab — clearing is its own
 * button. Every dismissal (✕, scrim, Escape, drag) commits nothing, which is
 * what keeps a league X from turning into a real 9 when a cell is only looked at.
 */
export function ScoreEditSheet({
  name,
  holeNumber,
  par,
  score,
  pickedUp,
  max,
  onScore,
  onPickup,
  onClose,
}: Props) {
  // As PlayerScoreRow works it out, so the selected chip is the same green or
  // red here as on the Hole tab.
  const tone =
    score == null
      ? 'empty'
      : score < par
        ? 'under'
        : score > par
          ? 'over'
          : 'even';

  const commit = (value: number | null) => {
    onScore(value);
    onClose();
  };

  return (
    <Sheet title={`${name} · Hole ${holeNumber} · Par ${par}`} onClose={onClose}>
      <div className={`sc-edit tone-${tone}`}>
        <ScoreChips
          name={name}
          par={par}
          value={score}
          max={max}
          pickedUp={pickedUp}
          onPickup={
            onPickup &&
            (() => {
              onPickup();
              onClose();
            })
          }
          onChange={(v) => {
            if (v != null) return commit(v);
            // ScoreChips reports null for a tap on the selected number. Under
            // an X that number is the stored 9, so the tap means "make it a
            // real 9": setScoreAt clears the pick-up when it writes a score.
            if (pickedUp && score != null) return commit(score);
            onClose();
          }}
        />
      </div>
      {(score != null || pickedUp) && (
        <button type="button" className="btn-secondary sc-edit-clear" onClick={() => commit(null)}>
          Clear score
        </button>
      )}
    </Sheet>
  );
}
