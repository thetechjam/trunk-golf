import { useRef, useState } from 'react';
import { listRounds, listCourses } from '../storage';
import { offerBackup, restoreFromFile, describeRestore } from '../backup';
import { currentBackupStatus, type BackupStatus } from '../backupStatus';
import { formatRoundDate, todayIso } from '../roundDate';
import { count } from '../plural';

/**
 * The Settings sheet's "Your rounds" block: write a backup file, or merge one
 * back in.
 *
 * Lives in its own file rather than inline in SettingsSheet because it is the
 * only row group there that owns async work and a status line — everything
 * else in that sheet is a switch over a single setting.
 */

/**
 * The second hint under "Back up your rounds": when this device last handed
 * over a backup, and how many finished rounds have changed since. Null when
 * there is nothing saved, so the first hint stands alone.
 */
function backupFreshness(status: BackupStatus, hasRounds: boolean): string | null {
  if (!hasRounds) return null;
  if (status.lastBackupAt === null) return 'Never backed up';
  const when = formatRoundDate(todayIso(new Date(status.lastBackupAt)));
  return status.unbacked
    ? `Last backup: ${when} · ${count(status.unbacked, 'round')} since`
    : `Last backup: ${when}`;
}

export function BackupRows({
  onRestored,
  onBackedUp,
}: { onRestored?: () => void; onBackedUp?: () => void } = {}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const counts = { rounds: listRounds().length, courses: listCourses().length };
  // Read on mount, and again after an export or restore moves the mark.
  const [backup, setBackup] = useState(() => currentBackupStatus());
  const freshness = backupFreshness(backup, counts.rounds > 0);

  const say = (msg: string, isError = false) => {
    setStatus(msg);
    setFailed(isError);
  };

  const exportBackup = async () => {
    const result = await offerBackup();
    if (!result.ok) {
      if (result.aborted) return;
      say("That backup couldn't be saved.", true);
      return;
    }
    setBackup(currentBackupStatus());
    say(`Backed up ${count(counts.rounds, 'round')} and ${count(counts.courses, 'course')}.`);
    onBackedUp?.();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Clear immediately: without this, picking the same file twice in a row
    // fires no change event the second time and the row looks dead.
    e.target.value = '';
    if (!picked) return;

    const result = await restoreFromFile(picked);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    setBackup(currentBackupStatus());
    say(describeRestore(result));
    onRestored?.();
  };

  return (
    <>
      <button className="set-row set-action" onClick={exportBackup}>
        <span>
          <span className="set-label">Back up your rounds</span>
          <span className="set-hint">
            {counts.rounds === 0
              ? 'Nothing saved on this device yet'
              : `Save ${count(counts.rounds, 'round')} and ${count(
                  counts.courses,
                  'course'
                )} to a file`}
          </span>
          {freshness && <span className="set-hint">{freshness}</span>}
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button className="set-row set-action" onClick={() => fileRef.current?.click()}>
        <span>
          <span className="set-label">Restore from a backup</span>
          <span className="set-hint">Merges into this device — nothing is deleted</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* Hidden because the button above is the control. The input is only the
          mechanism that opens the picker, so it never needs to take focus. */}
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} hidden />

      {status && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {status}
        </p>
      )}
    </>
  );
}
