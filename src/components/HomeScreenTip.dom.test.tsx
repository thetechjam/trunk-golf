// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HomeScreenTip } from './InstallPrompt';
import * as platform from '../platform';
import type { StorageRisk } from '../platform';

/**
 * Home's standing tip: the other half of the Safari-to-home-screen path that
 * `BringRoundsOver` finishes. What it says turns on where Trunk is running
 * and whether there is anything saved to bring across.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HomeScreenTip', () => {
  const tip = () => document.querySelector('p.hint');
  const withSteps = (risk: StorageRisk) => {
    vi.spyOn(platform, 'storageRisk').mockReturnValue(risk);
    vi.spyOn(platform, 'installSteps').mockReturnValue('Tap Share, then Add to Home Screen.');
  };

  it.each(['installed', 'native'] as const)('says nothing when %s', (risk) => {
    withSteps(risk);
    render(<HomeScreenTip hasRounds />);
    expect(tip()).toBeNull();
  });

  it('gives the steps in a Safari tab with nothing saved', () => {
    withSteps('evicting');
    render(<HomeScreenTip hasRounds={false} />);
    expect(tip()!.textContent).toBe(
      'Tip: add Trunk to your home screen, so Safari keeps your rounds. Tap Share, then Add to Home Screen.'
    );
  });

  it('says to back up first in a Safari tab with rounds', () => {
    withSteps('evicting');
    render(<HomeScreenTip hasRounds />);
    expect(tip()!.textContent).toBe(
      'Tip: add Trunk to your home screen, so Safari keeps your rounds. Back up first — the home screen app starts empty. Tap Share, then Add to Home Screen.'
    );
  });

  it('is the plain one-tap line in other browsers', () => {
    withSteps('browser');
    render(<HomeScreenTip hasRounds />);
    expect(tip()!.textContent).toBe('Tip: add Trunk to your home screen for one-tap access on the course.');
  });
});
