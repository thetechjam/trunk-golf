import type { Round } from './types';
import { getSettings, listRounds, type Settings } from './storage';
import { storageRisk, type StorageRisk } from './platform';

/**
 * Is a backup due? One answer, used by the nudge and the Settings line.
 *
 * A backup is as current as the day it was made, so what matters is how many
 * finished rounds have changed since then, weighed by how exposed this install
 * is: a Safari tab can lose everything after seven days without a visit; an
 * installed app or the native shell only to a lost or replaced phone.
 *
 * `backupStatus` is pure so the rules can be tested without storage;
 * `currentBackupStatus` feeds it from storage and the platform.
 */

export interface NudgeRule {
  minUnbacked: number;
  quietDays: number;
}

/** How many unbacked finished rounds, and how long since the last answer, before asking again. */
export const NUDGE_RULES: Record<StorageRisk, NudgeRule> = {
  evicting: { minUnbacked: 1, quietDays: 5 },
  browser: { minUnbacked: 3, quietDays: 30 },
  installed: { minUnbacked: 10, quietDays: 90 },
  native: { minUnbacked: 10, quietDays: 90 },
};

const DAY_MS = 86_400_000;

export interface BackupStatus {
  risk: StorageRisk;
  /** Finished rounds on this device. */
  finished: number;
  /** Finished rounds changed since the last backup — all of them if there has never been one. */
  unbacked: number;
  lastBackupAt: number | null;
  /** The nudge should be on screen now. */
  due: boolean;
  /** True for the first-finished-round prompt; false for a later reminder. */
  first: boolean;
}

export function backupStatus(input: {
  rounds: Pick<Round, 'status' | 'updatedAt'>[];
  settings: Pick<Settings, 'lastBackupAt' | 'backupNudgeSnoozedAt' | 'firstFinishPromptDismissed'>;
  risk: StorageRisk;
  now: number;
}): BackupStatus {
  const { rounds, settings, risk, now } = input;
  const lastBackupAt = settings.lastBackupAt ?? null;
  const since = lastBackupAt ?? 0;

  const finished = rounds.filter((r) => r?.status === 'finished');
  // A round without a usable timestamp cannot be shown to be in a backup.
  const unbacked = finished.filter(
    (r) => typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt) || r.updatedAt > since
  ).length;

  const base = { risk, finished: finished.length, unbacked, lastBackupAt };
  if (unbacked === 0) return { ...base, due: false, first: false };
  if (!settings.firstFinishPromptDismissed) return { ...base, due: true, first: true };

  const rule = NUDGE_RULES[risk] ?? NUDGE_RULES.browser;
  // In a Safari tab a round can be wiped after seven days, so a recent backup
  // buys no quiet: any newer finished round is due. Only "Not now" waits, and
  // for less than the wipe window.
  const snoozedAt = settings.backupNudgeSnoozedAt ?? 0;
  const lastAnswer = risk === 'evicting' ? snoozedAt : Math.max(since, snoozedAt);
  const due = unbacked >= rule.minUnbacked && now - lastAnswer >= rule.quietDays * DAY_MS;
  return { ...base, due, first: false };
}

/** The same, read from storage and the platform. */
export function currentBackupStatus(now: number = Date.now()): BackupStatus {
  return backupStatus({ rounds: listRounds(), settings: getSettings(), risk: storageRisk(), now });
}
