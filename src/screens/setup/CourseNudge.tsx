/**
 * Handicap strokes are in play and no hole has a stroke index, so the strokes
 * will fall on holes 1, 2, 3… in order — not on the hard holes. Nothing on
 * New Round used to say so; the round simply started and a shot landed on
 * an easy par 5.
 *
 * A note, not a warning: Start Round works as before. The whole line is the
 * button, and it opens the row where the fix is.
 */
interface Props {
  /** A course name is set (typed, picked or loaded). */
  named: boolean;
  onSet: () => void;
}

export function CourseNudge({ named, onSet }: Props) {
  return (
    <div className="course-nudge" role="status">
      <button type="button" onClick={onSet}>
        {named ? (
          <>
            No hole difficulty set — handicap strokes will fall on holes 1, 2, 3…{' '}
            <span className="course-nudge-act">Set it for the right holes.</span>
          </>
        ) : (
          <>
            No course set — handicap strokes will fall on holes 1, 2, 3…{' '}
            <span className="course-nudge-act">Set the course for the right holes.</span>
          </>
        )}
      </button>
    </div>
  );
}
