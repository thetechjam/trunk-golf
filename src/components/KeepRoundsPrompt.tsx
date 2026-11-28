import { useEffect, useId, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../storage';
import { offerBackup } from '../backup';
import { currentBackupStatus, type BackupStatus } from '../backupStatus';
import { isIOS } from '../platform';
import { CheckIcon } from '../icons';
import { focusScreenHeading } from '../focusHeading';
import { AddToHomeSteps } from './AddToHomeSteps';
import { InstallPrompt } from './InstallPrompt';

/**
 * Due after the first finished round, and again later while finished rounds
 * go unbacked. The rules live in `backupStatus.ts`; this only asks.
 */
export function keepRoundsPromptDue(): boolean {
  return currentBackupStatus().due;
}

/** The heading and body, which depend on where Trunk is running and whether it has asked before. */
function promptCopy(status: BackupStatus, place: string): { heading: string; body: string } {
  const { risk, first, unbacked } = status;
  if (first) {
    const heading = 'Keep your rounds safe';
    if (risk === 'evicting') {
      return {
        heading,
        body: `Right now your rounds live only in Safari, which can clear them after a week away. Save a backup (takes a few seconds), then add Trunk to your ${place}.`,
      };
    }
    if (risk === 'browser') {
      return {
        heading,
        body: 'Right now your rounds live only in this browser. Save a backup (takes a few seconds) so there’s a copy outside it.',
      };
    }
    return {
      heading,
      body: 'Your rounds live only on this phone. Save a backup (takes a few seconds) — it’s the copy that survives a new phone.',
    };
  }

  const one = unbacked === 1;
  const heading = one ? '1 round isn’t backed up' : `${unbacked} rounds aren’t backed up`;
  const lives = one ? 'It lives' : 'They live';
  if (risk === 'evicting') {
    return {
      heading,
      body: `${lives} only in Safari, which can clear ${one ? 'it' : 'them'} after a week away. Save a backup (takes a few seconds).`,
    };
  }
  if (risk === 'browser') {
    return { heading, body: `${lives} only in this browser. Save a backup so there’s a copy outside it.` };
  }
  return { heading, body: `${lives} only on this phone. Save a backup — it’s the copy that survives a new phone.` };
}

/** "Not now" this many times on reminders, and the card offers to stop asking. */
const OFFER_STOP_AFTER = 2;

/**
 * Asks for a backup after the first finished round, and reminds later while
 * rounds go unbacked. In a Safari tab, where a site's data can be cleared
 * after a week away, a saved backup is followed by the way to the home screen
 * — the home screen app starts empty, and the backup is how the rounds get
 * there.
 *
 * Every write goes through `saveSettings`, which returns null on a refused
 * write rather than throwing. A refused write still closes the card for the
 * session; it asks again next launch, which is the honest outcome of an
 * answer that could not be stored.
 *
 * The install button is the browser's own when it offers one (Chromium);
 * iOS gets the drawn steps after the backup instead.
 *
 * `onAnswered` runs when the card is closed by an answer — "Not now",
 * "Don’t remind me" or Done — so Results can hold the Home Screen card back
 * for the rest of the session.
 */
export function KeepRoundsPrompt({
  offerInstall = true,
  onAnswered,
}: { offerInstall?: boolean; onAnswered?: () => void } = {}) {
  const [status] = useState(() => currentBackupStatus());
  const [snoozes] = useState(() => getSettings().backupNudgeSnoozeCount);
  const [visible, setVisible] = useState(status.due);
  const [failed, setFailed] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const savedRef = useRef<HTMLParagraphElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const titleId = useId();

  // The Save button unmounts with the save; without this, keyboard and
  // VoiceOver users are left on <body>.
  useEffect(() => {
    if (backedUp) savedRef.current?.focus();
  }, [backedUp]);
  // So does "Show me how": focus goes to the steps it revealed.
  useEffect(() => {
    if (showHow) stepsRef.current?.focus();
  }, [showHow]);

  if (!visible) return null;

  const evicting = status.risk === 'evicting';
  const place = isIOS() ? 'Home Screen' : 'Dock';
  const { heading, body } = promptCopy(status, place);
  const installed = status.risk === 'installed' || status.risk === 'native';
  const offerStop = !status.first && snoozes >= OFFER_STOP_AFTER;

  // Every way the card closes unmounts the button just pressed, so focus goes
  // to the screen's heading rather than <body>.
  const close = () => {
    setVisible(false);
    onAnswered?.();
    focusScreenHeading();
  };

  const notNow = () => {
    saveSettings({
      firstFinishPromptDismissed: true,
      backupNudgeSnoozedAt: Date.now(),
      backupNudgeSnoozeCount: snoozes + 1,
    });
    close();
  };

  const stopReminding = () => {
    saveSettings({ backupRemindersOff: true, firstFinishPromptDismissed: true });
    close();
  };

  const save = async () => {
    const result = await offerBackup();
    if (!result.ok) {
      if (result.aborted) return;
      setFailed(true);
      return;
    }
    // A backup is the answer the prompt was asking for. `offerBackup` records
    // when; this records that the first ask is answered, and starts the
    // "Not now" count over.
    saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozeCount: 0 });
    setFailed(false);
    setBackedUp(true);
  };

  if (backedUp) {
    return (
      <div className="keep-rounds">
        <p className="keep-saved" role="status" tabIndex={-1} ref={savedRef}>
          <CheckIcon size={20} />
          <span>Backup saved</span>
        </p>
        {evicting && (
          <p>
            Next, add Trunk to your {place}. It starts empty there, so open it and restore this
            backup.
          </p>
        )}
        {evicting && showHow && (
          <>
            <AddToHomeSteps ref={stepsRef} />
            <p>Then open Trunk from your {place} and tap Restore from a backup.</p>
          </>
        )}
        {offerInstall && !installed && <InstallPrompt />}
        <div className="keep-rounds-actions">
          {evicting && !showHow && (
            <button type="button" className="btn-secondary" onClick={() => setShowHow(true)}>
              Show me how to add to {place}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="keep-rounds" aria-labelledby={titleId}>
      <h2 className="keep-title" id={titleId}>
        {heading}
      </h2>
      <p>{body}</p>
      {offerInstall && !installed && <InstallPrompt />}
      <div className="keep-rounds-actions">
        <button type="button" className="btn-secondary" onClick={save}>
          Save a backup
        </button>
        <button type="button" className="btn-ghost" onClick={notNow}>
          Not now
        </button>
        {offerStop && (
          <button type="button" className="btn-ghost" onClick={stopReminding}>
            Don’t remind me
          </button>
        )}
      </div>
      {failed && (
        <p className="fb-status bad" role="status">
          That backup couldn’t be saved.
        </p>
      )}
    </section>
  );
}
