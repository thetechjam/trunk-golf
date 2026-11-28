import { describe, it, expect } from 'vitest';
import { backupStatus, NUDGE_RULES } from './backupStatus';
import type { StorageRisk } from './platform';
import type { Round } from './types';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 25, 12);

type R = Pick<Round, 'status' | 'updatedAt'>;
const done = (updatedAt: number): R => ({ status: 'finished', updatedAt });
const playing = (updatedAt: number): R => ({ status: 'in_progress', updatedAt });
const many = (n: number, updatedAt = NOW - DAY): R[] => Array.from({ length: n }, () => done(updatedAt));

const settings = (over: Partial<Parameters<typeof backupStatus>[0]['settings']> = {}) => ({
  firstFinishPromptDismissed: true,
  lastBackupAt: null,
  backupNudgeSnoozedAt: null,
  backupRemindersOff: false,
  ...over,
});

const RISKS: StorageRisk[] = ['evicting', 'browser', 'installed', 'native'];

describe('backupStatus', () => {
  it('is not due with no finished rounds', () => {
    const s = backupStatus({
      rounds: [playing(NOW)],
      settings: settings({ firstFinishPromptDismissed: false }),
      risk: 'evicting',
      now: NOW,
    });
    expect(s).toMatchObject({ due: false, unbacked: 0, finished: 0 });
  });

  it.each(RISKS)('asks after the first finished round on %s', (risk) => {
    const s = backupStatus({
      rounds: [done(NOW - DAY)],
      settings: settings({ firstFinishPromptDismissed: false }),
      risk,
      now: NOW,
    });
    expect(s).toMatchObject({ due: true, first: true, unbacked: 1, finished: 1, risk });
  });

  it('reminds an auto-dismissed Safari tab that has never backed up', () => {
    // The phones that already had a finished round when the prompt shipped.
    const s = backupStatus({ rounds: [done(NOW - DAY)], settings: settings(), risk: 'evicting', now: NOW });
    expect(s).toMatchObject({ due: true, first: false, unbacked: 1, lastBackupAt: null });
  });

  it('waits for three unbacked rounds in a plain browser', () => {
    const at = (n: number) =>
      backupStatus({ rounds: many(n), settings: settings(), risk: 'browser', now: NOW }).due;
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });

  it('waits for ten unbacked rounds when installed', () => {
    const at = (n: number) =>
      backupStatus({ rounds: many(n), settings: settings(), risk: 'installed', now: NOW }).due;
    expect(at(9)).toBe(false);
    expect(at(10)).toBe(true);
  });

  it('stays quiet for five days after "Not now" in a Safari tab', () => {
    const snoozed = (days: number) =>
      backupStatus({
        rounds: [done(NOW - 30 * DAY)],
        settings: settings({ backupNudgeSnoozedAt: NOW - days * DAY }),
        risk: 'evicting',
        now: NOW,
      }).due;
    expect(snoozed(4)).toBe(false);
    expect(snoozed(5)).toBe(true);
    expect(NUDGE_RULES.evicting.quietDays).toBe(5);
    // Shorter than the seven days after which Safari can wipe the round.
    expect(NUDGE_RULES.evicting.quietDays).toBeLessThan(7);
  });

  it('is not due in a Safari tab the day after a backup, and is due at backup + 5 days', () => {
    const B = NOW - DAY;
    const status = (now: number) =>
      backupStatus({
        rounds: [done(B - DAY), done(B + DAY / 2)],
        settings: settings({ lastBackupAt: B }),
        risk: 'evicting',
        now,
      });
    expect(status(NOW)).toMatchObject({ unbacked: 1, first: false, due: false });
    expect(status(B + 5 * DAY - 1).due).toBe(false);
    expect(status(B + 5 * DAY).due).toBe(true);
  });

  it('in a Safari tab, waits out the later of the backup and the "Not now"', () => {
    const s = (backupDaysAgo: number, snoozedDaysAgo: number) =>
      backupStatus({
        rounds: [done(NOW - 30 * DAY), done(NOW)],
        settings: settings({
          lastBackupAt: NOW - backupDaysAgo * DAY,
          backupNudgeSnoozedAt: NOW - snoozedDaysAgo * DAY,
        }),
        risk: 'evicting',
        now: NOW,
      }).due;
    // "Not now" is the later answer.
    expect(s(10, 4)).toBe(false);
    expect(s(10, 5)).toBe(true);
    // The backup is the later answer.
    expect(s(4, 10)).toBe(false);
    expect(s(5, 10)).toBe(true);
  });

  it('counts only finished rounds changed since the last backup', () => {
    const T = NOW - 20 * DAY;
    const rounds = [done(T - DAY), done(T), done(T + DAY)];
    const s = backupStatus({
      rounds,
      settings: settings({ lastBackupAt: T }),
      risk: 'evicting',
      now: NOW,
    });
    expect(s).toMatchObject({ finished: 3, unbacked: 1, lastBackupAt: T, due: true });
  });

  it.each(RISKS)(
    'on %s, waits out the quiet period from the backup, not from the new round',
    (risk) => {
      const { quietDays } = NUDGE_RULES[risk];
      const T = NOW - 200 * DAY;
      const status = (now: number) =>
        backupStatus({
          rounds: [done(T - DAY), ...many(NUDGE_RULES[risk].minUnbacked, T + DAY)],
          settings: settings({ lastBackupAt: T }),
          risk,
          now,
        });
      expect(status(T + 2 * DAY)).toMatchObject({ due: false });
      expect(status(T + quietDays * DAY - 1).due).toBe(false);
      expect(status(T + quietDays * DAY).due).toBe(true);
    }
  );

  it('is not due when everything finished is in the last backup', () => {
    const s = backupStatus({
      rounds: [done(NOW - 40 * DAY)],
      settings: settings({ lastBackupAt: NOW - 30 * DAY, firstFinishPromptDismissed: false }),
      risk: 'evicting',
      now: NOW,
    });
    expect(s).toMatchObject({ unbacked: 0, due: false });
  });

  it('never counts an in-progress round', () => {
    const s = backupStatus({
      rounds: [playing(NOW), playing(NOW), playing(NOW)],
      settings: settings(),
      risk: 'browser',
      now: NOW,
    });
    expect(s).toMatchObject({ finished: 0, unbacked: 0, due: false });
  });

  it('counts a round with no usable updatedAt as unbacked, without throwing', () => {
    const broken = [
      { status: 'finished' } as R,
      { status: 'finished', updatedAt: 'yesterday' } as unknown as R,
      { status: 'finished', updatedAt: Number.NaN } as R,
    ];
    let s: ReturnType<typeof backupStatus> | undefined;
    expect(() => {
      s = backupStatus({
        rounds: broken,
        settings: settings({ lastBackupAt: NOW - DAY }),
        risk: 'browser',
        now: NOW + 365 * DAY,
      });
    }).not.toThrow();
    expect(s).toMatchObject({ finished: 3, unbacked: 3, due: true });
  });

  describe('with reminders turned off', () => {
    const cases = RISKS.flatMap((risk) => [
      { risk, firstFinishPromptDismissed: false },
      { risk, firstFinishPromptDismissed: true },
    ]);

    it.each(cases)(
      'is never due on $risk (first prompt dismissed: $firstFinishPromptDismissed)',
      ({ risk, firstFinishPromptDismissed }) => {
        const B = NOW - 400 * DAY;
        const s = backupStatus({
          rounds: [done(B - DAY), ...many(20, B + DAY)],
          settings: settings({
            backupRemindersOff: true,
            firstFinishPromptDismissed,
            lastBackupAt: B,
          }),
          risk,
          now: NOW,
        });
        expect(s).toMatchObject({ due: false, unbacked: 20, finished: 21, lastBackupAt: B, risk });
      }
    );

    it('still reports unbacked rounds when there has never been a backup', () => {
      const s = backupStatus({
        rounds: many(3),
        settings: settings({ backupRemindersOff: true }),
        risk: 'browser',
        now: NOW,
      });
      expect(s).toMatchObject({ due: false, unbacked: 3, lastBackupAt: null });
    });
  });
});
