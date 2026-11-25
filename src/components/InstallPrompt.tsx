import { useEffect, useState } from 'react';
import { DownloadIcon } from '../icons';
import { requestPersistentStorage } from '../persistence';
import { installSteps, storageRisk } from '../platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export { isInstalled } from '../platform';

/**
 * Shows an "Install" button on browsers that support it (Android/Chrome/Edge).
 * iOS Safari doesn't fire beforeinstallprompt, so it falls back to the
 * add-to-home-screen hint elsewhere on the page.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      // Chromium grants persistent storage to installed sites.
      void requestPersistentStorage();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <button className="install-btn" onClick={install}>
      <DownloadIcon size={17} /> Install Trunk as an app
    </button>
  );
}

/**
 * Home's standing tip. Where Safari clears a tab's data after seven days, it
 * says how to stop that, and that the home screen app starts empty when there
 * is something to bring over. Installed and native need no tip at all.
 */
export function HomeScreenTip({ hasRounds }: { hasRounds: boolean }) {
  const risk = storageRisk();
  if (risk === 'installed' || risk === 'native') return null;
  if (risk === 'browser') {
    return <p className="hint">Tip: add Trunk to your home screen for one-tap access on the course.</p>;
  }
  const steps = installSteps();
  return (
    <p className="hint">
      Tip: add Trunk to your home screen, so Safari keeps your rounds.
      {hasRounds && ' Back up first — the home screen app starts empty.'}
      {steps && ` ${steps}`}
    </p>
  );
}
