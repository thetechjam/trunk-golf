import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  listRounds,
  listCourses,
  saveRound,
  saveCourse,
  skipKeepPromptIfRoundsExist,
} from './storage';
import { makeRound, player } from './games/testFixtures';

// Vitest runs in node — back localStorage with a Map.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('settings', () => {
  beforeEach(() => store.clear());

  it('defaults keepAwake on when nothing is stored', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings().keepAwake).toBe(true);
  });

  it('persists a patch and reads it back', () => {
    saveSettings({ keepAwake: false });
    expect(getSettings().keepAwake).toBe(false);
    saveSettings({ keepAwake: true });
    expect(getSettings().keepAwake).toBe(true);
  });

  it('returns the merged settings from saveSettings', () => {
    expect(saveSettings({ keepAwake: false })).toEqual({ ...DEFAULT_SETTINGS, keepAwake: false });
  });

  it('merges stored partials over defaults (forward-compatible)', () => {
    store.set('press.settings.v1', '{}');
    expect(getSettings().keepAwake).toBe(true);
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set('press.settings.v1', 'not-json{');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults theme to system and glare off', () => {
    expect(getSettings().theme).toBe('system');
    expect(getSettings().glare).toBe(false);
  });

  it('carries a v1 sunlight:true across to glare', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    expect(getSettings().glare).toBe(true);
  });

  it('drops the legacy sunlight key on the next write', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true, sunlight: true }));
    saveSettings({ keepAwake: false });
    expect(JSON.parse(store.get('press.settings.v1')!)).toEqual({
      keepAwake: false,
      theme: 'system',
      glare: true,
      reporterName: '',
      firstFinishPromptDismissed: false,
      lastBackupAt: null,
      backupNudgeSnoozedAt: null,
      installTipDismissed: false,
      backupNudgeSnoozeCount: 0,
      backupRemindersOff: false,
    });
  });

  it('falls back to system when a stored theme is unrecognized', () => {
    store.set('press.settings.v1', JSON.stringify({ theme: 'sepia' }));
    expect(getSettings().theme).toBe('system');
  });

  it('persists an explicit theme', () => {
    saveSettings({ theme: 'dark' });
    expect(getSettings().theme).toBe('dark');
  });

  it('defaults reporterName to an empty string', () => {
    expect(getSettings().reporterName).toBe('');
  });

  it('round-trips reporterName', () => {
    saveSettings({ reporterName: 'Bo' });
    expect(getSettings().reporterName).toBe('Bo');
  });

  // getSettings and saveSettings both build their result field-by-field (so the
  // legacy `sunlight` key cannot survive a write). A field added to only one of
  // them vanishes on the next unrelated save — this is the guard for that.
  it('keeps reporterName across an unrelated save', () => {
    saveSettings({ reporterName: 'Bo' });
    saveSettings({ keepAwake: false });
    expect(getSettings().reporterName).toBe('Bo');
  });

  it('defaults the first-round prompt to not dismissed', () => {
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });

  it('keeps a dismissed first-round prompt across an unrelated save', () => {
    saveSettings({ firstFinishPromptDismissed: true });
    saveSettings({ keepAwake: false });
    expect(getSettings().firstFinishPromptDismissed).toBe(true);
  });

  it('defaults both backup timestamps to null', () => {
    expect(getSettings().lastBackupAt).toBeNull();
    expect(getSettings().backupNudgeSnoozedAt).toBeNull();
  });

  it('reads settings written before the backup timestamps existed', () => {
    store.set('press.settings.v1', JSON.stringify({ keepAwake: false, firstFinishPromptDismissed: true }));
    expect(getSettings()).toMatchObject({
      keepAwake: false,
      firstFinishPromptDismissed: true,
      lastBackupAt: null,
      backupNudgeSnoozedAt: null,
    });
  });

  it('keeps lastBackupAt across an unrelated save', () => {
    saveSettings({ lastBackupAt: 1_700_000_000_000 });
    saveSettings({ keepAwake: false });
    expect(getSettings().lastBackupAt).toBe(1_700_000_000_000);
  });

  it('keeps backupNudgeSnoozedAt across an unrelated save', () => {
    saveSettings({ backupNudgeSnoozedAt: 1_700_000_000_000 });
    saveSettings({ theme: 'dark' });
    expect(getSettings().backupNudgeSnoozedAt).toBe(1_700_000_000_000);
  });

  it.each([
    ['a string', '1700000000000'],
    ['a negative number', -5],
    ['zero', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('reads %s stored as a timestamp as null', (_name, v) => {
    store.set('press.settings.v1', '{"keepAwake":false}');
    // JSON cannot carry NaN or Infinity, so the parsed object is handed back
    // directly: this is the field check, not a parse failure.
    const parse = vi
      .spyOn(JSON, 'parse')
      .mockReturnValue({ keepAwake: false, lastBackupAt: v, backupNudgeSnoozedAt: v });
    try {
      const got = getSettings();
      expect(got.keepAwake).toBe(false);
      expect(got.lastBackupAt).toBeNull();
      expect(got.backupNudgeSnoozedAt).toBeNull();
    } finally {
      parse.mockRestore();
    }
  });

  it('defaults the install tip, snooze count and reminders-off fields', () => {
    expect(getSettings()).toMatchObject({
      installTipDismissed: false,
      backupNudgeSnoozeCount: 0,
      backupRemindersOff: false,
    });
  });

  it('reads settings written before the install tip and reminder fields existed', () => {
    store.set(
      'press.settings.v1',
      JSON.stringify({ keepAwake: false, firstFinishPromptDismissed: true, backupNudgeSnoozedAt: 1_700_000_000_000 })
    );
    expect(getSettings()).toMatchObject({
      keepAwake: false,
      firstFinishPromptDismissed: true,
      backupNudgeSnoozedAt: 1_700_000_000_000,
      installTipDismissed: false,
      backupNudgeSnoozeCount: 0,
      backupRemindersOff: false,
    });
  });

  it('keeps installTipDismissed across an unrelated save', () => {
    saveSettings({ installTipDismissed: true });
    saveSettings({ keepAwake: false });
    expect(getSettings().installTipDismissed).toBe(true);
  });

  it('keeps backupNudgeSnoozeCount across an unrelated save', () => {
    saveSettings({ backupNudgeSnoozeCount: 2 });
    saveSettings({ theme: 'dark' });
    expect(getSettings().backupNudgeSnoozeCount).toBe(2);
  });

  it('keeps backupRemindersOff across an unrelated save', () => {
    saveSettings({ backupRemindersOff: true });
    saveSettings({ reporterName: 'Bo' });
    expect(getSettings().backupRemindersOff).toBe(true);
  });

  it('stores a 0 snooze count and a false reminders-off rather than keeping the old values', () => {
    saveSettings({ backupNudgeSnoozeCount: 2, backupRemindersOff: true, installTipDismissed: true });
    saveSettings({ backupNudgeSnoozeCount: 0, backupRemindersOff: false });
    expect(getSettings()).toMatchObject({
      backupNudgeSnoozeCount: 0,
      backupRemindersOff: false,
      installTipDismissed: true,
    });
  });

  it.each([
    ['a string', '2'],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('reads %s stored as the snooze count as 0', (_name, v) => {
    store.set('press.settings.v1', '{"keepAwake":false}');
    // As above: JSON cannot carry NaN or Infinity, so the parsed object is handed back.
    const parse = vi
      .spyOn(JSON, 'parse')
      .mockReturnValue({ keepAwake: false, backupNudgeSnoozeCount: v });
    try {
      const got = getSettings();
      expect(got.keepAwake).toBe(false);
      expect(got.backupNudgeSnoozeCount).toBe(0);
    } finally {
      parse.mockRestore();
    }
  });

  it.each([
    ['a string', 'true'],
    ['a number', 1],
    ['null', null],
  ])('reads %s stored as a boolean flag as false', (_name, v) => {
    store.set(
      'press.settings.v1',
      JSON.stringify({ installTipDismissed: v, backupRemindersOff: v })
    );
    expect(getSettings()).toMatchObject({ installTipDismissed: false, backupRemindersOff: false });
  });
});

describe('skipKeepPromptIfRoundsExist', () => {
  beforeEach(() => store.clear());

  it('marks a phone that has not finished a round as still eligible', () => {
    skipKeepPromptIfRoundsExist();
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
    // Stored, not just defaulted: the next launch must be able to tell this
    // phone from one that finished rounds before the prompt existed.
    expect(JSON.parse(store.get('press.settings.v1')!).firstFinishPromptDismissed).toBe(false);
  });

  it('keeps the prompt due for a new user who finishes a round and relaunches', () => {
    // No settings ever saved. First launch, then a finished round, then the
    // app is closed without answering the prompt and opened again.
    skipKeepPromptIfRoundsExist();
    saveRound(makeRound({ status: 'finished' }));
    skipKeepPromptIfRoundsExist();
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });

  it('does not throw when the settings write is refused', () => {
    // A full phone: this runs before render, outside the error boundary, so a
    // throw here is an app that never starts.
    saveRound(makeRound({ status: 'finished' }));
    const setItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(() => skipKeepPromptIfRoundsExist()).not.toThrow();
    } finally {
      localStorage.setItem = setItem;
    }
    expect(store.has('press.settings.v1')).toBe(false);
  });

  it('dismisses the prompt when a finished round predates the flag', () => {
    saveRound(makeRound({ status: 'finished' }));
    store.set('press.settings.v1', JSON.stringify({ keepAwake: true }));
    skipKeepPromptIfRoundsExist();
    expect(getSettings().firstFinishPromptDismissed).toBe(true);
  });

  it('does not override a prompt that is still waiting to be seen', () => {
    // The flag is already stored, so this is a phone that finished its first
    // round after the prompt existed and has not dismissed it.
    saveRound(makeRound({ status: 'finished' }));
    saveSettings({ firstFinishPromptDismissed: false });
    skipKeepPromptIfRoundsExist();
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });
});

describe('a damaged list', () => {
  // One bad entry used to take the whole list with it: a null threw on
  // Home, and a course with a non-string name threw inside the sort.
  it('keeps the rounds around a null entry', () => {
    const good = makeRound({ players: [player('p1', 'Al')] });
    localStorage.setItem('press.rounds.v1', JSON.stringify([null, good, 5]));
    expect(listRounds().map((r) => r.id)).toEqual([good.id]);
  });

  it('keeps the courses around one with no name', () => {
    localStorage.setItem(
      'press.courses.v1',
      JSON.stringify([
        { id: 'a', name: 'Zed', holes: [] },
        { id: 'b', holes: [] },
        { id: 'c', name: 'Able', holes: [] },
      ])
    );
    expect(listCourses().map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('saveRound', () => {
  beforeEach(() => store.clear());

  it('reports a write that storage refused instead of throwing out of the score handler', () => {
    const r = makeRound({ players: [player('p1', 'Al')] });
    expect(saveRound(r)).toBe(true);
    expect(listRounds().map((x) => x.id)).toEqual([r.id]);

    const real = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(saveRound({ ...r, course: 'Torrey' })).toBe(false);
    } finally {
      localStorage.setItem = real;
    }
    // What was there is still there.
    expect(listRounds()[0].course).toBeUndefined();
  });
});

describe('saveCourse', () => {
  beforeEach(() => store.clear());

  const course = { id: 'c1', name: 'Pebble Beach', holes: [{ number: 1, par: 4 }] };

  it('reports a QuotaExceededError and leaves the courses that were already there', () => {
    expect(saveCourse(course)).toBe(true);
    expect(listCourses().map((c) => c.name)).toEqual(['Pebble Beach']);

    const real = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(saveCourse({ ...course, id: 'c2', name: 'Torrey Pines South' })).toBe(false);
    } finally {
      localStorage.setItem = real;
    }
    expect(listCourses().map((c) => c.name)).toEqual(['Pebble Beach']);
  });
});
