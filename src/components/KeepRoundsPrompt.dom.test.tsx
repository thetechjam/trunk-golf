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
  vi.spyOn(platform, 'installSteps').mockReturnValue(
    risk === 'evicting' ? 'Tap Share, then Add to Home Screen.' : null
  );
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
  it('counts the unbacked rounds in a later reminder', () => {
    onPlatform('browser');
    finishedRounds(3);
    answeredFirst();
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('3 rounds aren’t backed up.')).toBeTruthy();
    expect(screen.getByText(/saved in this browser and nowhere else/)).toBeTruthy();
  });

  it('says “1 round” in the singular on Safari', () => {
    onPlatform('evicting');
    finishedRounds(1);
    answeredFirst();
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('1 round isn’t backed up.')).toBeTruthy();
    expect(screen.getByText(/Safari can delete them/)).toBeTruthy();
  });

  it('“Not now” stores the snooze, hides it, and it stays hidden after a remount', () => {
    onPlatform('evicting');
    finishedRounds(1);
    answeredFirst();
    const view = render(<KeepRoundsPrompt />);
    notNow();
    expect(screen.queryByText('1 round isn’t backed up.')).toBeNull();
    expect(getSettings().backupNudgeSnoozedAt).toBe(T0);

    view.unmount();
    render(<KeepRoundsPrompt />);
    expect(screen.queryByText('1 round isn’t backed up.')).toBeNull();
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
    expect(screen.queryByText('1 round isn’t backed up.')).toBeNull();
    again.unmount();

    vi.setSystemTime(T0 + 5 * DAY);
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('1 round isn’t backed up.')).toBeTruthy();
  });

  it('on Safari, the first ask says the home screen app starts empty', () => {
    onPlatform('evicting');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('Keep these rounds.')).toBeTruthy();
    const body = screen.getByText(/Save a backup first/);
    expect(body.textContent).toMatch(/restore the backup there/);
    expect(body.textContent).toMatch(/starts empty/);
  });

  it('on other browsers, the first ask is the one it always was', () => {
    onPlatform('browser');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('Keep these rounds.')).toBeTruthy();
    expect(screen.getByText(/Some browsers, Safari among them/)).toBeTruthy();
  });

  it('on Safari, a saved backup is followed by the way to the home screen', async () => {
    onPlatform('evicting');
    finishedRounds(1);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
    render(<KeepRoundsPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe(
      'Backup saved. Next: add Trunk to your home screen. Tap Share, then Add to Home Screen. Then open it and restore the backup.'
    );
    expect(getSettings().firstFinishPromptDismissed).toBe(true);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('elsewhere, a saved backup just says so', async () => {
    onPlatform('browser');
    finishedRounds(1);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
    render(<KeepRoundsPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    expect((await screen.findByRole('status')).textContent).toBe('Backup saved.');
  });

  it('after a backup from a later reminder, the stale count goes and the status stays', async () => {
    onPlatform('browser');
    finishedRounds(3);
    answeredFirst();
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
    render(<KeepRoundsPrompt />);
    expect(screen.getByText('3 rounds aren’t backed up.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    expect((await screen.findByRole('status')).textContent).toBe('Backup saved.');
    expect(screen.queryByText(/aren’t backed up/)).toBeNull();
    expect(screen.queryByText(/saved in this browser and nowhere else/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
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
    expect(screen.getByText('10 rounds aren’t backed up.')).toBeTruthy();
    expect(screen.getByText(/survives a new phone/)).toBeTruthy();
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

  it('says so when the backup fails', async () => {
    onPlatform('browser');
    finishedRounds(1);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: false });
    render(<KeepRoundsPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe("That backup couldn't be saved.");
    expect(status.className).toMatch(/bad/);
  });

  it('still closes on “Not now” when the answer cannot be stored', () => {
    onPlatform('evicting');
    finishedRounds(1);
    render(<KeepRoundsPrompt />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      notNow();
      expect(screen.queryByText('Keep these rounds.')).toBeNull();
    } finally {
      restore();
    }
    expect(getSettings().backupNudgeSnoozedAt).toBeNull();
  });
});
