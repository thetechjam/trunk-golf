// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { KeepRoundsPrompt } from './KeepRoundsPrompt';
import { getSettings, saveRounds, saveSettings } from '../storage';
import { makeRound } from '../games/testFixtures';
import { refuseStorageKey } from '../testQuota';
import * as platform from '../platform';
import * as backup from '../backup';
import type { StorageRisk } from '../platform';

/**
 * The backup nudge: the first-round ask, and the later reminder while
 * finished rounds go unbacked. When it is due is `backupStatus.test.ts`'s;
 * what is pinned here is what it says on each platform and what its buttons
 * store.
 */

const DAY = 86_400_000;
const T0 = new Date('2026-11-01T12:00:00Z').getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const onPlatform = (risk: StorageRisk) => {
  vi.spyOn(platform, 'storageRisk').mockReturnValue(risk);
};

/** `n` finished rounds, saved now, so all of them are newer than any backup. */
const finishedRounds = (n: number) =>
  saveRounds(
    Array.from({ length: n }, (_, i) => ({ ...makeRound({ status: 'finished' }), id: `r${i + 1}` }))
  );

/** Past the first-round ask: the state of somebody who has answered it before. */
const answeredFirst = () => saveSettings({ firstFinishPromptDismissed: true });

const notNow = () => fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

describe('KeepRoundsPrompt', () => {
  const heading = () => document.querySelector('h2.keep-title');

  it('counts the unbacked rounds in a later reminder', () => {
    onPlatform('browser');
    finishedRounds(3);
    answeredFirst();
    render(<KeepRoundsPrompt />);
    expect(screen.getByRole('heading', { name: '3 rounds aren’t backed up' })).toBeTruthy();
    expect(
      screen.getByText('They live only in this browser. Save a backup so there’s a copy outside it.')
    ).toBeTruthy();
  });

  it('says “1 round” and “It lives” in the singular on Safari', () => {
    onPlatform('evicting');
    finishedRounds(1);
    answeredFirst();
    render(<KeepRoundsPrompt />);
    expect(screen.getByRole('heading', { name: '1 round isn’t backed up' })).toBeTruthy();
    expect(
      screen.getByText(
        'It lives only in Safari, which can clear it after a week away. Save a backup (takes a few seconds).'
      )
    ).toBeTruthy();
  });

  it('the heading is a labelled h2 inside a section', () => {
    onPlatform('browser');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    const h = heading()!;
    expect(h.textContent).toBe('Keep your rounds safe');
    expect(h.closest('section')!.getAttribute('aria-labelledby')).toBe(h.id);
  });

  it('“Not now” stores the snooze, hides it, and it stays hidden after a remount', () => {
    onPlatform('evicting');
    finishedRounds(1);
    answeredFirst();
    const view = render(<KeepRoundsPrompt />);
    notNow();
    expect(heading()).toBeNull();
    expect(getSettings().backupNudgeSnoozedAt).toBe(T0);

    view.unmount();
    render(<KeepRoundsPrompt />);
    expect(heading()).toBeNull();
  });

  it('“Not now” counts up each time it is tapped', () => {
    onPlatform('evicting');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    notNow();
    expect(getSettings().backupNudgeSnoozeCount).toBe(1);
    cleanup();

    vi.setSystemTime(T0 + 5 * DAY);
    render(<KeepRoundsPrompt />);
    notNow();
    expect(getSettings().backupNudgeSnoozeCount).toBe(2);
  });

  it('comes back once the quiet period has passed', () => {
    onPlatform('evicting');
    finishedRounds(1);
    answeredFirst();
    const view = render(<KeepRoundsPrompt />);
    notNow();
    view.unmount();

    vi.setSystemTime(T0 + 4 * DAY);
    const again = render(<KeepRoundsPrompt />);
    expect(heading()).toBeNull();
    again.unmount();

    vi.setSystemTime(T0 + 5 * DAY);
    render(<KeepRoundsPrompt />);
    expect(heading()!.textContent).toBe('1 round isn’t backed up');
  });

  it.each([
    [
      'evicting',
      'Right now your rounds live only in Safari, which can clear them after a week away. Save a backup (takes a few seconds), then add Trunk to your Home Screen.',
    ],
    [
      'browser',
      'Right now your rounds live only in this browser. Save a backup (takes a few seconds) so there’s a copy outside it.',
    ],
    [
      'installed',
      'Your rounds live only on this phone. Save a backup (takes a few seconds) — it’s the copy that survives a new phone.',
    ],
    [
      'native',
      'Your rounds live only on this phone. Save a backup (takes a few seconds) — it’s the copy that survives a new phone.',
    ],
  ] as const)('the first ask on %s', (risk, body) => {
    onPlatform(risk);
    vi.spyOn(platform, 'isIOS').mockReturnValue(true);
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    expect(heading()!.textContent).toBe('Keep your rounds safe');
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('waits for ten unbacked rounds in an installed app', () => {
    onPlatform('installed');
    finishedRounds(9);
    answeredFirst();
    const view = render(<KeepRoundsPrompt />);
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();
    view.unmount();

    finishedRounds(10);
    render(<KeepRoundsPrompt />);
    expect(heading()!.textContent).toBe('10 rounds aren’t backed up');
    expect(
      screen.getByText('They live only on this phone. Save a backup — it’s the copy that survives a new phone.')
    ).toBeTruthy();
  });

  describe('“Don’t remind me”', () => {
    const dontRemind = () => screen.queryByRole('button', { name: 'Don’t remind me' });

    it('is offered on a reminder after “Not now” twice, and keeps the card away for good', () => {
      onPlatform('evicting');
      finishedRounds(1);
      saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozeCount: 2 });
      const view = render(<KeepRoundsPrompt />);
      fireEvent.click(dontRemind()!);
      expect(heading()).toBeNull();
      expect(getSettings().backupRemindersOff).toBe(true);
      view.unmount();

      vi.setSystemTime(T0 + 365 * DAY);
      finishedRounds(5);
      render(<KeepRoundsPrompt />);
      expect(heading()).toBeNull();
    });

    it('is not offered after one “Not now”', () => {
      onPlatform('evicting');
      finishedRounds(1);
      saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozeCount: 1 });
      render(<KeepRoundsPrompt />);
      expect(heading()).toBeTruthy();
      expect(dontRemind()).toBeNull();
    });

    it('is not offered on a first ask', () => {
      onPlatform('evicting');
      finishedRounds(1);
      saveSettings({ backupNudgeSnoozeCount: 2 });
      render(<KeepRoundsPrompt />);
      expect(heading()!.textContent).toBe('Keep your rounds safe');
      expect(dontRemind()).toBeNull();
    });
  });

  describe('after a saved backup', () => {
    const saveBackup = async () => {
      vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
      fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
      return screen.findByRole('status');
    };

    it('says so, focuses the line, and puts Done after it as a real button', async () => {
      onPlatform('browser');
      finishedRounds(1);
      render(<KeepRoundsPrompt />);
      const status = await saveBackup();
      expect(status.textContent).toBe('Backup saved');
      expect(status.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
      expect(document.activeElement).toBe(status);
      const done = screen.getByRole('button', { name: 'Done' });
      expect(done.className).toBe('btn-secondary');
      expect(status.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(getSettings().firstFinishPromptDismissed).toBe(true);
    });

    it('elsewhere than Safari, offers no home screen steps', async () => {
      onPlatform('browser');
      finishedRounds(1);
      render(<KeepRoundsPrompt />);
      await saveBackup();
      expect(screen.queryByRole('button', { name: /Show me how/ })).toBeNull();
      expect(screen.queryByText(/Next, add Trunk/)).toBeNull();
    });

    it('on Safari, says what comes next and shows the steps on request', async () => {
      onPlatform('evicting');
      vi.spyOn(platform, 'isIOS').mockReturnValue(true);
      finishedRounds(1);
      render(<KeepRoundsPrompt />);
      await saveBackup();
      expect(
        screen.getByText(
          'Next, add Trunk to your Home Screen. It starts empty there, so open it and restore this backup.'
        )
      ).toBeTruthy();
      const how = screen.getByRole('button', { name: 'Show me how to add to Home Screen' });
      // It goes once pressed, so it is not a toggle and claims no expanded state.
      expect(how.hasAttribute('aria-expanded')).toBe(false);
      expect(screen.queryByText('Tap Share')).toBeNull();

      how.focus();
      fireEvent.click(how);
      // The pressed button unmounts; focus goes to the steps it revealed.
      const steps = document.querySelector<HTMLElement>('ol.a2hs-steps')!;
      expect(document.activeElement).toBe(steps);
      expect(steps.tabIndex).toBe(-1);
      expect(screen.getByText('Tap Share')).toBeTruthy();
      expect(screen.getByText('Add to Home Screen')).toBeTruthy();
      expect(
        screen.getByText('Then open Trunk from your Home Screen and tap Restore from a backup.')
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Show me how/ })).toBeNull();
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Done']);
    });

    it('drops the stale count from a later reminder', async () => {
      onPlatform('browser');
      finishedRounds(3);
      answeredFirst();
      render(<KeepRoundsPrompt />);
      expect(heading()!.textContent).toBe('3 rounds aren’t backed up');
      expect((await saveBackup()).textContent).toBe('Backup saved');
      expect(screen.queryByText(/aren’t backed up/)).toBeNull();
      expect(screen.queryByText(/live only in this browser/)).toBeNull();
    });

    it('starts the “Not now” count over', async () => {
      onPlatform('evicting');
      finishedRounds(1);
      saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozeCount: 2 });
      render(<KeepRoundsPrompt />);
      await saveBackup();
      expect(getSettings().backupNudgeSnoozeCount).toBe(0);
    });

    it('Done closes it', async () => {
      onPlatform('browser');
      finishedRounds(1);
      render(<KeepRoundsPrompt />);
      await saveBackup();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('the saved state is not an answer until Done', async () => {
      onPlatform('evicting');
      finishedRounds(1);
      const onAnswered = vi.fn();
      render(<KeepRoundsPrompt onAnswered={onAnswered} />);
      await saveBackup();
      fireEvent.click(screen.getByRole('button', { name: /Show me how/ }));
      expect(onAnswered).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onAnswered).toHaveBeenCalledOnce();
    });
  });

  describe('closing', () => {
    /** The card under a screen heading, as Home and Results mount it. */
    const renderOnScreen = (onAnswered = vi.fn()) => {
      render(
        <div className="screen">
          <h1 tabIndex={-1}>Results</h1>
          <KeepRoundsPrompt onAnswered={onAnswered} />
        </div>
      );
      return onAnswered;
    };
    const h1 = () => screen.getByRole('heading', { level: 1 });
    const press = (name: string) => {
      const b = screen.getByRole('button', { name });
      b.focus();
      fireEvent.click(b);
    };

    it('“Not now” moves focus to the screen heading and counts as an answer', () => {
      onPlatform('evicting');
      finishedRounds(1);
      const onAnswered = renderOnScreen();
      press('Not now');
      expect(heading()).toBeNull();
      expect(document.activeElement).toBe(h1());
      expect(onAnswered).toHaveBeenCalledOnce();
    });

    it('“Don’t remind me” does the same', () => {
      onPlatform('evicting');
      finishedRounds(1);
      saveSettings({ firstFinishPromptDismissed: true, backupNudgeSnoozeCount: 2 });
      const onAnswered = renderOnScreen();
      press('Don’t remind me');
      expect(document.activeElement).toBe(h1());
      expect(onAnswered).toHaveBeenCalledOnce();
    });

    it('Done does the same', async () => {
      onPlatform('browser');
      finishedRounds(1);
      const onAnswered = renderOnScreen();
      vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
      fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
      await screen.findByRole('status');
      press('Done');
      expect(screen.queryByRole('status')).toBeNull();
      expect(document.activeElement).toBe(h1());
      expect(onAnswered).toHaveBeenCalledOnce();
    });

    it('a cancelled or failed save is not an answer', async () => {
      onPlatform('browser');
      finishedRounds(1);
      const onAnswered = renderOnScreen();
      const offer = vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: true });
      fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
      await waitFor(() => expect(offer).toHaveBeenCalledOnce());
      offer.mockResolvedValue({ ok: false, aborted: false });
      fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
      await screen.findByRole('status');
      expect(onAnswered).not.toHaveBeenCalled();
    });
  });

  it('leaves the card as it was when the share is cancelled', async () => {
    onPlatform('browser');
    finishedRounds(1);
    const offer = vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: true });
    render(<KeepRoundsPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    await waitFor(() => expect(offer).toHaveBeenCalledOnce());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });

  it('says so when the backup fails, and keeps its buttons', async () => {
    onPlatform('browser');
    finishedRounds(1);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: false });
    render(<KeepRoundsPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('That backup couldn’t be saved.');
    expect(status.className).toMatch(/bad/);
    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  it('still closes on “Not now” when the answer cannot be stored', () => {
    onPlatform('evicting');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      notNow();
      expect(heading()).toBeNull();
    } finally {
      restore();
    }
    expect(getSettings().backupNudgeSnoozedAt).toBeNull();
  });
});
