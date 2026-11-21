// @vitest-environment happy-dom
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseSearch } from './CourseSearch';
import { CourseTimeoutError, type FetchedCourse } from '../courses/openGolfApi';
import { resetSnapshot, SNAPSHOT_URL } from '../courses/snapshot';

function Harness() {
  const [value, setValue] = useState('');
  return <CourseSearch value={value} onChange={setValue} onPick={() => {}} />;
}

afterEach(() => {
  cleanup();
  resetSnapshot();
  vi.unstubAllGlobals();
});

describe('CourseSearch errors', () => {
  it('shows the friendly message when a lookup takes too long', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new CourseTimeoutError(
        'Course search is taking too long. Check your connection and try again.'
      );
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(await screen.findByText(/taking too long/)).toBeTruthy();
  });

  it('shows the friendly fallback, not the status code, when search returns a 5xx', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(
      await screen.findByText('Search unavailable — your typed course name still works.')
    ).toBeTruthy();
    expect(screen.queryByText(/503/)).toBeNull();
  });

  it('shows the friendly fallback when a picked course returns an HTTP error', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/search')
        ? {
            ok: true,
            json: async () => ({ courses: [{ id: '1', name: 'Pebble Beach', par: 72 }] }),
          }
        : { ok: false, status: 404, json: async () => ({}) }
    );
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    await user.click(await screen.findByRole('button', { name: /Pebble Beach/ }));
    expect(
      await screen.findByText('Could not load that course. Pick another or keep your typed name.')
    ).toBeTruthy();
    expect(screen.queryByText(/404/)).toBeNull();
  });
});

describe('CourseSearch offline fallback', () => {
  const LIST = {
    format: 1,
    courses: [['Pebble Beach Golf Links', 'Pebble Beach', 'CA', 72, '4534343544434534..']],
  };

  function stub(live: 'down' | 'empty') {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === SNAPSHOT_URL) return { ok: true, json: async () => LIST };
      return live === 'down'
        ? { ok: false, status: 522, json: async () => ({}) }
        : { ok: true, json: async () => ({ courses: [] }) };
    });
  }

  it('says the results are from the offline list, in the live region', async () => {
    stub('down');
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(await screen.findByRole('button', { name: /Pebble Beach Golf Links/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^From the offline course list/);
    expect(screen.getByText(/Contains data from OpenGolfAPI \(opengolfapi\.org\)/)).toBeTruthy();
  });

  it('hands over the whole card, with the guessed holes named, when one is picked', async () => {
    stub('empty');
    let picked: FetchedCourse | null = null;
    function Picking() {
      const [value, setValue] = useState('');
      return <CourseSearch value={value} onChange={setValue} onPick={(c) => (picked = c)} />;
    }
    const user = userEvent.setup();
    render(<Picking />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    await user.click(await screen.findByRole('button', { name: /Pebble Beach Golf Links/ }));
    await vi.waitFor(() => expect(picked).not.toBeNull());
    expect(picked!.holes).toHaveLength(18);
    expect(picked!.estimated).toEqual([17, 18]);
    expect(picked!.hasStrokeIndex).toBe(false);
  });

  it('keeps the typed name when neither live nor the list has a match', async () => {
    stub('down');
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Nowhere');
    expect(
      await screen.findByText(
        'Course search is not answering and the offline course list has no match — your typed name will be used as-is.'
      )
    ).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /Course/ }) as HTMLInputElement).value).toBe('Nowhere');
  });
});
