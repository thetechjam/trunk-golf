import { describe, it, expect, beforeEach } from 'vitest';
import {
  describePersistence,
  describeStorage,
  persistenceStatus,
  readPersistence,
  requestPersistentStorage,
  resetPersistenceForTests,
  type PersistState,
} from './persistence';

beforeEach(resetPersistenceForTests);

describe('requestPersistentStorage', () => {
  it('is unknown where the API does not exist', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unknown');
    expect(persistenceStatus()).toBe('unknown');
  });

  it('records a yes', async () => {
    const storage = { persisted: async () => false, persist: async () => true };
    expect(await requestPersistentStorage(storage)).toBe('persisted');
    expect(describePersistence()).toBe('Storage protected');
  });

  it('records a no', async () => {
    const storage = { persisted: async () => false, persist: async () => false };
    expect(await requestPersistentStorage(storage)).toBe('best-effort');
    expect(describePersistence()).toBe('Storage not protected — back up or install');
  });

  it('does not ask again once storage is already persistent', async () => {
    let asked = 0;
    const storage = {
      persisted: async () => true,
      persist: async () => {
        asked += 1;
        return true;
      },
    };
    expect(await requestPersistentStorage(storage)).toBe('persisted');
    expect(asked).toBe(0);
  });

  it('treats a throwing API as unknown rather than failing startup', async () => {
    const storage = {
      persisted: async () => {
        throw new Error('nope');
      },
      persist: async () => true,
    };
    expect(await requestPersistentStorage(storage)).toBe('unknown');
    expect(describePersistence('unknown')).toBe('Storage status unknown');
  });
});

describe('readPersistence', () => {
  // Passed a `persist` that throws: reading must never ask, because asking is
  // what shows Firefox's permission prompt.
  const never = () => {
    throw new Error('readPersistence must not ask');
  };

  it('reports already-persistent storage without asking', async () => {
    const storage = { persisted: async () => true, persist: never };
    expect(await readPersistence(storage)).toBe('persisted');
    expect(persistenceStatus()).toBe('persisted');
  });

  it('reports best-effort storage without asking', async () => {
    const storage = { persisted: async () => false, persist: never };
    expect(await readPersistence(storage)).toBe('best-effort');
    expect(persistenceStatus()).toBe('best-effort');
  });

  it('is unknown where the API does not exist', async () => {
    expect(await readPersistence(undefined)).toBe('unknown');
    expect(await readPersistence({} as Pick<StorageManager, 'persisted'>)).toBe('unknown');
  });

  it('is unknown when the API throws', async () => {
    const storage = {
      persisted: async () => {
        throw new Error('nope');
      },
      persist: never,
    };
    expect(await readPersistence(storage)).toBe('unknown');
  });
});

describe('describeStorage', () => {
  const states: PersistState[] = ['persisted', 'best-effort', 'unknown'];

  it.each(states)('never calls a Safari tab protected (%s)', (s) => {
    expect(describeStorage(s, 'evicting')).toBe('Storage: browser tab — cleared after 7 days unused');
  });

  it('reads an installed app as protected once the browser said yes', () => {
    expect(describeStorage('persisted', 'installed')).toBe('Storage protected');
  });

  it.each(['best-effort', 'unknown'] as const)('reads an installed app as installed (%s)', (s) => {
    expect(describeStorage(s, 'installed')).toBe('Storage: installed app');
  });

  it('reads a plain browser as the browser answered', () => {
    expect(describeStorage('persisted', 'browser')).toBe('Storage protected');
    expect(describeStorage('best-effort', 'browser')).toBe('Storage not protected — back up or install');
    expect(describeStorage('unknown', 'browser')).toBe('Storage status unknown');
  });

  it.each(states)('says nothing on native (%s)', (s) => {
    expect(describeStorage(s, 'native')).toBe('');
  });
});
