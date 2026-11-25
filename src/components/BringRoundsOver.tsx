import { useRef, useState } from 'react';
import { listCourses, listRounds } from '../storage';
import { describeRestore, restoreFromFile } from '../backup';
import { isWebKit, storageRisk } from '../platform';

/**
 * On iPhone, iPad and Mac Safari, a Home Screen (or Dock) app keeps its own
 * storage, separate from Safari's, so it opens empty even for somebody with a
 * season of rounds in the browser. This is the way across: back up in Safari,
 * restore here.
 *
 * Shown only in that empty WebKit app. It has no dismissal and stores
 * nothing: it leaves with Home's empty state once there is a round.
 */
function bringRoundsOverDue(): boolean {
  return (
    storageRisk() === 'installed' &&
    isWebKit() &&
    listRounds().length === 0 &&
    listCourses().length === 0
  );
}

export function BringRoundsOver({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [visible] = useState(bringRoundsOverDue);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!visible) return null;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Clear so picking the same file again still fires a change.
    e.target.value = '';
    if (!picked) return;
    const result = await restoreFromFile(picked);
    if (!result.ok) {
      setFailed(true);
      setStatus(result.error);
      return;
    }
    setFailed(false);
    setStatus(describeRestore(result));
    onRestored();
  };

  return (
    <div className="keep-rounds bring-rounds">
      <strong>Played in Safari first?</strong>
      <p>
        Those rounds are still in Safari. Open Trunk there, go to Settings and back up your rounds.
        Then restore the file here.
      </p>
      <div className="keep-rounds-actions">
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </button>
      </div>
      {/* Hidden: the button above is the control; this only opens the picker. */}
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} hidden />
      {status && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
