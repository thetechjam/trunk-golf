import { useState } from 'react';
import { saveSettings } from '../storage';
import { offerBackup } from '../backup';
import { currentBackupStatus, type BackupStatus } from '../backupStatus';
import { installSteps } from '../platform';
import { InstallPrompt } from './InstallPrompt';

/**
 * Due after the first finished round, and again later while finished rounds
 * go unbacked. The rules live in `backupStatus.ts`; this only asks.
 */
export function keepRoundsPromptDue(): boolean {
  return currentBackupStatus().due;
}

const BROWSER_FIRST =
  'Some browsers, Safari among them, delete a site’s data after seven days without a visit. Add Trunk to your home screen and it keeps your rounds — and save a backup, so a copy lives outside this browser.';

/** The heading and body, which depend on where Trunk is running and whether it has asked before. */
function promptCopy(status: BackupStatus): { heading: string; body: string } {
  const { risk, first, unbacked } = status;
  if (first) {
    const heading = 'Keep these rounds.';
    if (risk === 'native') {
      return {
        heading,
        body: 'Your rounds are kept on this phone. Save a backup too — it is the copy that survives a new phone.',
      };
    }
    if (risk === 'installed') {
      return {
        heading,
        body: 'Trunk is on your home screen, so your browser keeps these rounds. Save a backup too — it is the copy that survives a new phone.',
      };
    }
    if (risk === 'evicting') {
      return {
        heading,
        body: 'Safari deletes a site’s data after seven days without a visit. Save a backup first. Then add Trunk to your home screen and restore the backup there — the home screen app starts empty.',
      };
    }
    return { heading, body: BROWSER_FIRST };
  }

  const heading = unbacked === 1 ? '1 round isn’t backed up.' : `${unbacked} rounds aren’t backed up.`;
  if (risk === 'evicting') {
    return {
      heading,
      body: 'Safari can delete them after seven days without a visit. Save a backup, so a copy lives outside this browser.',
    };
  }
  if (risk === 'browser') {
    return {
      heading,
      body: 'They are saved in this browser and nowhere else. Save a backup, so a copy lives outside it.',
    };
  }
  return {
    heading,
    body: 'They are saved on this phone and nowhere else. Save a backup — it is the copy that survives a new phone.',
  };
}

/** In a Safari tab the backup is only half the job: the home screen app starts empty. */
function savedCopy(status: BackupStatus): string {
  if (status.risk !== 'evicting') return 'Backup saved.';
  const steps = installSteps();
  return `Backup saved. Next: add Trunk to your home screen.${steps ? ` ${steps}` : ''} Then open it and restore the backup.`;
}

/**
 * Safari deletes a site's data after seven days without a visit unless the
 * app is on the home screen. This asks after the first finished round, and
 * reminds later while rounds go unbacked: save a backup, and add Trunk to the
 * home screen.
 *
 * Every write goes through `saveSettings`, which returns null on a refused
 * write rather than throwing. A refused write still closes the card for the
 * session; it asks again next launch, which is the honest outcome of an
 * answer that could not be stored.
 *
 * The install button is the browser's own when it offers one; the sentence
 * is the same hint Home already carries, which is what iOS gets instead.
 */
export function KeepRoundsPrompt({ offerInstall = true }: { offerInstall?: boolean } = {}) {
  const [status] = useState(() => currentBackupStatus());
  const [visible, setVisible] = useState(status.due);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  if (!visible) return null;

  const { heading, body } = promptCopy(status);
  const installed = status.risk === 'installed' || status.risk === 'native';

  const close = () => {
    if (!backedUp) saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozedAt: Date.now() });
    setVisible(false);
  };

  const save = async () => {
    const result = await offerBackup();
    if (!result.ok) {
      if (result.aborted) return;
      setFailed(true);
      setMessage("That backup couldn't be saved.");
      return;
    }
    // A backup is the answer the prompt was asking for. `offerBackup` records
    // when; this records that the first ask is answered. It stays on screen
    // to say so, with a button that closes it.
    saveSettings({ firstFinishPromptDismissed: true });
    setBackedUp(true);
    setFailed(false);
    setMessage(savedCopy(status));
  };

  return (
    <div className="keep-rounds">
      <strong>{heading}</strong>
      <p>{body}</p>
      {offerInstall && !installed && <InstallPrompt />}
      <div className="keep-rounds-actions">
        {!backedUp && (
          <button type="button" className="btn-secondary" onClick={save}>
            Save a backup
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={close}>
          {backedUp ? 'Done' : 'Not now'}
        </button>
      </div>
      {message && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
