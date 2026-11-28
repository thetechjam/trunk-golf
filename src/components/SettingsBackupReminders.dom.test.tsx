// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';
import { getSettings, saveSettings } from '../storage';

/**
 * The Settings switch that undoes "Don't remind me" on the backup card.
 * On means reminders are on: it shows `!backupRemindersOff`.
 */

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const toggle = () =>
  screen.getByRole('checkbox', { name: /Backup reminders/ }) as HTMLInputElement;

describe('Backup reminders switch', () => {
  it('shows on for a phone that never turned reminders off', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    expect(toggle().checked).toBe(true);
    expect(screen.getByText('Remind me when rounds aren’t backed up')).toBeTruthy();
  });

  it('shows off when reminders were turned off', () => {
    saveSettings({ backupRemindersOff: true });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    expect(toggle().checked).toBe(false);
  });

  it('turning it off stores backupRemindersOff and tells the app', () => {
    const onDataChanged = vi.fn();
    render(<SettingsSheet onClose={() => {}} screen="home" onDataChanged={onDataChanged} />);
    fireEvent.click(toggle());
    expect(toggle().checked).toBe(false);
    expect(getSettings().backupRemindersOff).toBe(true);
    expect(onDataChanged).toHaveBeenCalledTimes(1);
  });

  it('turning it back on clears the flag, zeroes the snooze count and tells the app', () => {
    saveSettings({ backupRemindersOff: true, backupNudgeSnoozeCount: 2 });
    const onDataChanged = vi.fn();
    render(<SettingsSheet onClose={() => {}} screen="home" onDataChanged={onDataChanged} />);
    fireEvent.click(toggle());
    expect(toggle().checked).toBe(true);
    expect(getSettings()).toMatchObject({ backupRemindersOff: false, backupNudgeSnoozeCount: 0 });
    expect(onDataChanged).toHaveBeenCalledTimes(1);
  });

  it('leaves the other backup settings alone', () => {
    saveSettings({ lastBackupAt: 1_700_000_000_000, backupNudgeSnoozedAt: 1_700_000_100_000 });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(toggle());
    expect(getSettings()).toMatchObject({
      lastBackupAt: 1_700_000_000_000,
      backupNudgeSnoozedAt: 1_700_000_100_000,
    });
  });
});
