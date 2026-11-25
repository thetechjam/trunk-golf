// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BringRoundsOver } from './BringRoundsOver';
import { Home } from '../screens/Home';
import { listRounds, saveCourse, saveRound } from '../storage';
import { buildBackup } from '../backup';
import { makeRound } from '../games/testFixtures';
import * as platform from '../platform';
import * as native from '../native';
import type { StorageRisk } from '../platform';
import type { Round } from '../types';

/**
 * The empty Home Screen app on Apple devices, which keeps storage of its own
 * apart from Safari's: the one place that says how to bring the rounds over.
 */

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const onPlatform = (risk: StorageRisk, webkit: boolean) => {
  vi.spyOn(platform, 'storageRisk').mockReturnValue(risk);
  vi.spyOn(platform, 'isWebKit').mockReturnValue(webkit);
};

const heading = () => screen.queryByText('Played in Safari first?');

const saved = (): Round => ({
  ...makeRound({ status: 'finished' }),
  id: 'from-safari',
  course: 'Safari Links',
  updatedAt: 5,
});

/** Picks a file through the hidden input, as the picker would. */
function pick(text: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = { name: 'trunk-backup.json', text: () => Promise.resolve(text) };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('BringRoundsOver', () => {
  it('shows in an empty Home Screen app on Apple devices', () => {
    onPlatform('installed', true);
    render(<BringRoundsOver onRestored={() => {}} />);
    expect(heading()).toBeTruthy();
    expect(screen.getByText(/Those rounds are still in Safari/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore from a backup' })).toBeTruthy();
  });

  it.each([
    ['a browser tab', 'browser' as const, false],
    ['a Safari tab', 'evicting' as const, true],
    ['an installed app off Apple devices', 'installed' as const, false],
    ['the native shell', 'native' as const, true],
  ])('stays away in %s', (_label, risk, webkit) => {
    onPlatform(risk, webkit);
    render(<BringRoundsOver onRestored={() => {}} />);
    expect(heading()).toBeNull();
  });

  it('stays away once a round is saved', () => {
    onPlatform('installed', true);
    saveRound(saved());
    render(<BringRoundsOver onRestored={() => {}} />);
    expect(heading()).toBeNull();
  });

  it('stays away once a course is saved', () => {
    onPlatform('installed', true);
    saveCourse({ id: 'c1', name: 'Home Links', holes: makeRound().holes });
    render(<BringRoundsOver onRestored={() => {}} />);
    expect(heading()).toBeNull();
  });

  it('restores a picked backup and says what it added', async () => {
    onPlatform('installed', true);
    const onRestored = vi.fn();
    render(<BringRoundsOver onRestored={onRestored} />);
    pick(JSON.stringify(buildBackup([saved()], [], 'test')));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('Added 1 round.');
    expect(status.className).not.toMatch(/bad/);
    expect(onRestored).toHaveBeenCalledOnce();
    expect(listRounds().map((r) => r.id)).toEqual(['from-safari']);
  });

  it('says what is wrong with a file that is not a backup, and restores nothing', async () => {
    onPlatform('installed', true);
    const onRestored = vi.fn();
    render(<BringRoundsOver onRestored={onRestored} />);
    pick('not json at all');
    const status = await screen.findByRole('status');
    expect(status.className).toMatch(/bad/);
    expect(status.textContent).not.toBe('');
    expect(onRestored).not.toHaveBeenCalled();
    expect(listRounds()).toEqual([]);
  });

  it('on Home, the restored rounds appear without leaving the screen', async () => {
    onPlatform('installed', true);
    vi.spyOn(native, 'isNative').mockReturnValue(false);
    const noop = () => {};
    render(
      <Home
        onNew={noop}
        onNewLeague={noop}
        onResume={noop}
        onViewResults={noop}
        onStats={noop}
        onHistory={noop}
      />
    );
    expect(screen.getByText('No rounds yet')).toBeTruthy();
    expect(heading()).toBeTruthy();

    pick(JSON.stringify(buildBackup([saved()], [], 'test')));
    expect(await screen.findByText('Safari Links')).toBeTruthy();
    expect(screen.queryByText('No rounds yet')).toBeNull();
    expect(heading()).toBeNull();
  });
});
