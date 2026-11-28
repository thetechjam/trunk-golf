// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HomeScreenTip } from './InstallPrompt';
import * as platform from '../platform';

/**
 * Home's grey one-liner. Only a browser with no seven-day rule gets it: a
 * Safari tab gets `HomeScreenCard` instead, and installed and native need
 * nothing.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HomeScreenTip', () => {
  const tip = () => document.querySelector('p.hint');

  it.each(['installed', 'native', 'evicting'] as const)('says nothing when %s', (risk) => {
    vi.spyOn(platform, 'storageRisk').mockReturnValue(risk);
    render(<HomeScreenTip />);
    expect(tip()).toBeNull();
  });

  it('is the plain one-tap line in other browsers', () => {
    vi.spyOn(platform, 'storageRisk').mockReturnValue('browser');
    render(<HomeScreenTip />);
    expect(tip()!.textContent).toBe('Tip: add Trunk to your Home Screen for one-tap access on the course.');
  });
});
