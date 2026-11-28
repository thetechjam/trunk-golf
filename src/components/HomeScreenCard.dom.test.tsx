// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HomeScreenCard, homeScreenCardDue } from './InstallPrompt';
import { getSettings } from '../storage';
import { refuseStorageKey } from '../testQuota';
import * as platform from '../platform';
import type { StorageRisk } from '../platform';

/**
 * Home's first-open card in a Safari tab: why to add Trunk to the home
 * screen, the two taps drawn out, and — with rounds saved — to back up
 * first. Shown until "Got it".
 */

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const on = (risk: StorageRisk, ios = true) => {
  vi.spyOn(platform, 'storageRisk').mockReturnValue(risk);
  vi.spyOn(platform, 'isIOS').mockReturnValue(ios);
};
const card = () => document.querySelector('section.home-screen-card');
const gotIt = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
const BACKUP_LINE = /Save a backup first \(Settings → Back up your rounds\)/;

describe('HomeScreenCard', () => {
  it('in a Safari tab, says why and draws both steps', () => {
    on('evicting');
    render(<HomeScreenCard hasRounds={false} />);
    expect(homeScreenCardDue()).toBe(true);
    const heading = screen.getByRole('heading', { name: 'Add Trunk to your Home Screen' });
    expect(card()!.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(
      screen.getByText(
        'Safari can clear a site’s saved rounds after a week away. On your Home Screen, Trunk keeps them.'
      )
    ).toBeTruthy();
    const steps = [...card()!.querySelectorAll('ol.a2hs-steps > li')].map((li) => li.textContent);
    expect(steps).toEqual(['Tap Share', 'Add to Home Screen']);
    for (const svg of card()!.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.queryByText(BACKUP_LINE)).toBeNull();
  });

  it('with rounds saved, says to back up first', () => {
    on('evicting');
    render(<HomeScreenCard hasRounds />);
    expect(screen.getByText(BACKUP_LINE).textContent).toBe(
      'Save a backup first (Settings → Back up your rounds). The Home Screen app starts empty, and you restore the backup there.'
    );
  });

  it.each(['browser', 'installed', 'native'] as const)('is not shown when %s', (risk) => {
    on(risk);
    render(<HomeScreenCard hasRounds />);
    expect(homeScreenCardDue()).toBe(false);
    expect(card()).toBeNull();
  });

  it('“Got it” stores the answer, hides it, and it stays hidden after a remount', () => {
    on('evicting');
    const view = render(<HomeScreenCard hasRounds />);
    gotIt();
    expect(card()).toBeNull();
    expect(getSettings().installTipDismissed).toBe(true);
    expect(homeScreenCardDue()).toBe(false);

    view.unmount();
    render(<HomeScreenCard hasRounds />);
    expect(card()).toBeNull();
  });

  it('still hides on “Got it” when the answer cannot be stored', () => {
    on('evicting');
    render(<HomeScreenCard hasRounds />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      gotIt();
      expect(card()).toBeNull();
    } finally {
      restore();
    }
    expect(getSettings().installTipDismissed).toBe(false);
  });

  it('in desktop Safari, says Dock and gives the menu steps', () => {
    on('evicting', false);
    render(<HomeScreenCard hasRounds />);
    expect(screen.getByRole('heading', { name: 'Add Trunk to your Dock' })).toBeTruthy();
    const steps = [...card()!.querySelectorAll('ol.a2hs-steps > li')].map((li) => li.textContent);
    expect(steps).toEqual(['File menu', 'Add to Dock']);
    expect(card()!.querySelector('ol svg')).toBeNull();
    expect(screen.getByText(BACKUP_LINE).textContent).toMatch(/The Dock app starts empty/);
  });
});
