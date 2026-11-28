/**
 * Handicap strokes are in play and no hole has a stroke index, so the strokes
 * will fall in hole order — not on the hard holes. (No hole numbers in the
 * copy: on a back nine the order starts at 10.) Nothing on New Round used to
 * say so; the round simply started and a shot landed on an easy par 5.
 *
 * A note, not a warning: Start Round works as before. The whole line is the
 * button, and it opens the row where the fix is. Not a live region: the
 * wording changes as the course is typed, and re-announcing a whole button on
 * each change would be noise.
 */
interface Props {
  /** A course name is set (typed, picked or loaded). */
  named: boolean;
  onSet: () => void;
}

export function CourseNudge({ named, onSet }: Props) {
  return (
    <div className="course-nudge">
      <button type="button" onClick={onSet}>
        {named ? (
          <>
            No hole difficulty set — handicap strokes will fall in hole order.{' '}
            <span className="course-nudge-act">Set it for the right holes.</span>
          </>
        ) : (
          <>
            No course set — handicap strokes will fall in hole order.{' '}
            <span className="course-nudge-act">Set the course for the right holes.</span>
          </>
        )}
      </button>
    </div>
  );
}
