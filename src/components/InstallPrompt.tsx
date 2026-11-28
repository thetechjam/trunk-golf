import { useEffect, useState } from 'react';
import { DownloadIcon } from '../icons';
import { requestPersistentStorage } from '../persistence';
import { isIOS, storageRisk } from '../platform';
import { getSettings, saveSettings } from '../storage';
import { AddToHomeSteps } from './AddToHomeSteps';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
 * Home's first-open card in a Safari tab, where a site's saved rounds can be
 * cleared after a week away and the home screen app is what keeps them.
 * Due until "Got it" is tapped once; Home decides whether it is the one
 * message on screen.
 */
export function homeScreenCardDue(): boolean {
  return storageRisk() === 'evicting' && !getSettings().installTipDismissed;
}

/**
 * The card itself: why, and the two taps drawn out. With rounds already saved
 * it says to back up first, because the home screen app starts empty and the
 * backup is how they get there.
 *
 * "Got it" stores the answer. A refused write still hides the card for this
 * visit; it comes back next launch, which is the honest outcome of an answer
 * that could not be kept.
 */
export function HomeScreenCard({ hasRounds }: { hasRounds: boolean }) {
  const [visible, setVisible] = useState(homeScreenCardDue);
  if (!visible) return null;

  // Desktop Safari keeps an installed site in the Dock, not on a home screen.
  const place = isIOS() ? 'Home Screen' : 'Dock';
  const dismiss = () => {
    saveSettings({ installTipDismissed: true });
    setVisible(false);
  };

  return (
    <section className="keep-rounds home-screen-card" aria-labelledby="home-screen-card-title">
      <h2 className="keep-title" id="home-screen-card-title">
        Add Trunk to your {place}
      </h2>
      <p>
        Safari can clear a site’s saved rounds after a week away.{' '}
        {place === 'Dock' ? 'In your Dock' : 'On your Home Screen'}, Trunk keeps them.
      </p>
      {hasRounds && (
        <p>
          Save a backup first (Settings → Back up your rounds). The {place} app starts empty, and
          you restore the backup there.
        </p>
      )}
      <AddToHomeSteps />
      <div className="keep-rounds-actions end">
        <button type="button" className="btn-ghost" onClick={dismiss}>
          Got it
        </button>
      </div>
    </section>
  );
}

/**
 * Home's grey one-liner, for browsers with no seven-day rule to warn about.
 * A Safari tab gets `HomeScreenCard` instead; installed and native need no
 * tip at all.
 */
export function HomeScreenTip() {
  if (storageRisk() !== 'browser') return null;
  return <p className="hint">Tip: add Trunk to your home screen for one-tap access on the course.</p>;
}
