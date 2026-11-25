// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupRows } from './BackupRows';
import * as backup from '../backup';
import { ROUNDS_KEY, SETTINGS_KEY, saveSettings, getSettings } from '../storage';
import { formatRoundDate, todayIso } from '../roundDate';
import { makeRound } from '../games/testFixtures';
import type { Round } from '../types';

/**
 * The "Your rounds" rows in Settings and on the error screen. The second hint
 * under "Back up your rounds" says when this device last handed over a backup,
 * so a player can see a backup is stale without waiting for the nudge.
 */

const DAY = 86_400_000;

/** Stored as-is, so `updatedAt` is what the test says rather than "now". */
function store(rounds: Round[]) {
  localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
}

const finished = (id: string, updatedAt: number) =>
  ({ ...makeRound({ status: 'finished' }), id, updatedAt }) as Round;

/** The text of every hint under "Back up your rounds". */
const hints = () =>
  [...screen.getByRole('button', { name: /Back up your rounds/i }).querySelectorAll('.set-hint')].map(
    (el) => el.textContent
  );

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the last-backup line', () => {
  it('shows nothing extra when nothing is saved', () => {
    render(<BackupRows />);
    expect(hints()).toEqual(['Nothing saved on this device yet']);
  });

  it('says "Never backed up" when there are rounds and no backup', () => {
    store([finished('a', Date.now())]);
    render(<BackupRows />);
    expect(hints()).toContain('Never backed up');
  });

  it('reads "Last backup: Today" straight after a successful export', async () => {
    const user = userEvent.setup();
    store([finished('a', Date.now() - DAY)]);
    // What the real offerBackup does on success, without a share sheet.
    vi.spyOn(backup, 'offerBackup').mockImplementation(async () => {
      saveSettings({ lastBackupAt: Date.now() });
      return { ok: true };
    });
    render(<BackupRows />);
    expect(hints()).toContain('Never backed up');

    await user.click(screen.getByRole('button', { name: /Back up your rounds/i }));
    expect(await screen.findByText('Backed up 1 round and 0 courses.')).toBeTruthy();
    expect(hints()).toContain('Last backup: Today');
  });

  it('tells the screen behind after a successful export', async () => {
    const user = userEvent.setup();
    store([finished('a', Date.now() - DAY)]);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
    const onBackedUp = vi.fn();
    const onRestored = vi.fn();
    render(<BackupRows onBackedUp={onBackedUp} onRestored={onRestored} />);
    await user.click(screen.getByRole('button', { name: /Back up your rounds/i }));
    expect(await screen.findByText('Backed up 1 round and 0 courses.')).toBeTruthy();
    expect(onBackedUp).toHaveBeenCalledTimes(1);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('leaves the line alone when the share sheet is closed', async () => {
    const user = userEvent.setup();
    store([finished('a', Date.now())]);
    const offer = vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: true });
    const onBackedUp = vi.fn();
    render(<BackupRows onBackedUp={onBackedUp} />);
    await user.click(screen.getByRole('button', { name: /Back up your rounds/i }));
    await vi.waitFor(() => expect(offer).toHaveBeenCalledOnce());
    expect(hints()).toContain('Never backed up');
    expect(onBackedUp).not.toHaveBeenCalled();
  });

  it('does not tell the screen behind when the export fails', async () => {
    const user = userEvent.setup();
    store([finished('a', Date.now())]);
    vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: false });
    const onBackedUp = vi.fn();
    render(<BackupRows onBackedUp={onBackedUp} />);
    await user.click(screen.getByRole('button', { name: /Back up your rounds/i }));
    expect(await screen.findByText("That backup couldn't be saved.")).toBeTruthy();
    expect(onBackedUp).not.toHaveBeenCalled();
  });

  it('counts finished rounds changed since the backup', () => {
    const mark = Date.now() - 3 * DAY;
    saveSettings({ lastBackupAt: mark });
    store([finished('a', mark - DAY), finished('b', mark + 1), finished('c', mark + DAY)]);
    render(<BackupRows />);
    const when = formatRoundDate(todayIso(new Date(mark)));
    expect(hints()).toContain(`Last backup: ${when} · 2 rounds since`);
  });

  it('says "round" for one', () => {
    const mark = Date.now() - 3 * DAY;
    saveSettings({ lastBackupAt: mark });
    store([finished('a', mark - DAY), finished('b', mark + DAY)]);
    render(<BackupRows />);
    const when = formatRoundDate(todayIso(new Date(mark)));
    expect(hints()).toContain(`Last backup: ${when} · 1 round since`);
  });

  it('drops the count when nothing changed since', () => {
    const mark = Date.now() - 3 * DAY;
    saveSettings({ lastBackupAt: mark });
    store([finished('a', mark - DAY)]);
    render(<BackupRows />);
    const when = formatRoundDate(todayIso(new Date(mark)));
    expect(hints()).toContain(`Last backup: ${when}`);
  });
});

describe('restoring from the rows', () => {
  it('reports the restore in the same sentence as before', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    const file = backup.buildBackup([finished('a', 1_000)], [], 'test', new Date(), undefined);
    const { container } = render(<BackupRows onRestored={onRestored} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;

    await user.upload(
      input,
      new File([JSON.stringify(file)], 'trunk-backup.json', { type: 'application/json' })
    );

    expect(await screen.findByText('Added 1 round.')).toBeTruthy();
    expect(onRestored).toHaveBeenCalledTimes(1);
    // A restore onto an empty device is a complete backup of it.
    expect(getSettings().lastBackupAt).toBeGreaterThan(0);
    expect(hints()).toContain('Last backup: Today');
  });

  it('shows the parse error and does not report a restore', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    const { container } = render(<BackupRows onRestored={onRestored} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;

    await user.upload(input, new File(['not json'], 'x.json', { type: 'application/json' }));

    const status = await screen.findByRole('status');
    expect(status.className).toContain('bad');
    expect(onRestored).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });
});
