// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FetchedCourse } from '../courses/openGolfApi';
import { checkScan } from '../courses/scanGate';
import { LADIES_PARS, PARS, SI, rawRowSet, rawScan } from '../courses/scanFixtures';
import { ScanCard } from './ScanCard';

// No canvas in happy-dom: the photo is "prepared" as the bytes it came in as.
vi.mock('../courses/scanImage', async (orig) => ({
  ...(await orig<typeof import('../courses/scanImage')>()),
  prepareScanImage: async (file: Blob) => new Blob([await file.arrayBuffer()], { type: 'image/jpeg' }),
}));

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'card.jpg', { type: 'image/jpeg' });

const reply = (raw: unknown, model = 'haiku') => {
  const g = checkScan(raw);
  return new Response(JSON.stringify({ ok: true, courseName: g.courseName, rowSets: g.rowSets, model }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const ladies = () =>
  rawRowSet({
    label: 'Ladies',
    audience: 'women',
    tees: ['Red'],
    holes: LADIES_PARS.map((par, i) => ({ number: i + 1, par, stroke_index: SI[i] })),
    printed_par_out: 37,
    printed_par_in: 37,
    printed_par_total: 74,
  });

function show(response: () => Response | Promise<Response>, courseName = '') {
  vi.stubGlobal('fetch', vi.fn(async () => response()));
  const applied: FetchedCourse[] = [];
  const user = userEvent.setup();
  const { container } = render(<ScanCard courseName={courseName} onApply={(c) => applied.push(c)} />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const scan = async () => {
    await user.upload(input, photo());
  };
  return { user, applied, input, scan };
}

beforeEach(() => {
  // happy-dom has no object URLs for blobs; the sheet only needs a string.
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-photo');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe('Scan the card', () => {
  it('offers the button with a file input that does not force the camera', () => {
    const { input } = show(() => reply(rawScan([rawRowSet()])));
    expect(screen.getByRole('button', { name: /Scan the card/ })).toBeTruthy();
    expect(input.accept).toBe('image/*');
    expect(input.hasAttribute('capture')).toBe(false);
    expect(
      screen.getByText('Photograph the printed scorecard. Trunk reads the pars and stroke indexes for you to check.')
    ).toBeTruthy();
  });

  it('is not offered inside the native shell', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    show(() => reply(rawScan([rawRowSet()])));
    expect(screen.queryByRole('button', { name: /Scan the card/ })).toBeNull();
  });

  it("asks which row is being played and picks nothing for the user", async () => {
    const { scan, user, applied } = show(() => reply(rawScan([rawRowSet(), ladies()])));
    await scan();
    expect(await screen.findByText("Read 2 rows from the card. Pick the one you're playing.")).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Which row are you playing?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(within(group).getByText(/Red · Ladies' · par 74 · with stroke index/)).toBeTruthy();
    // Nothing to apply until a row is chosen.
    expect(screen.queryByRole('button', { name: 'Use these pars' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Par for hole 1/ })).toBeNull();

    await user.click(radios[1]);
    expect(screen.getByRole('button', { name: 'Par for hole 2: 5' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Use these pars' }));
    expect(applied).toHaveLength(1);
    expect(applied[0].holes.map((h) => h.par)).toEqual(LADIES_PARS);
    expect(applied[0].name).toBe('Pine Valley');
  });

  it('shows a single row directly and still waits for the tap', async () => {
    const { scan, user, applied } = show(() => reply(rawScan([rawRowSet()])), 'My Club');
    await scan();
    expect(await screen.findByText('Read the card. Check it against the photo.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Your photo of the scorecard' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Course name').value).toBe('My Club');
    expect(applied).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Use these pars' }));
    expect(applied[0]).toMatchObject({ id: 'scan', name: 'My Club', hasStrokeIndex: true, listedPar: 72 });
  });

  it('flags a par no hole has, holds Apply until it is fixed, then clears the flags', async () => {
    const raw = rawRowSet();
    (raw.holes as { par: number }[])[2].par = 7;
    const { scan, user, applied } = show(() => reply(rawScan([raw])));
    await scan();
    const tile = await screen.findByRole('button', { name: 'Par for hole 3: 7 — check this' });
    expect(screen.getByText(/Hole 3 reads as a par no hole has/)).toBeTruthy();
    expect(screen.getByText('Front nine adds up to 40; the card prints 36.')).toBeTruthy();
    const apply = screen.getByRole('button', { name: 'Use these anyway' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    await user.click(tile); // 7 → 3, which is what the card prints
    expect(screen.getByRole('button', { name: 'Par for hole 3: 3' })).toBeTruthy();
    expect(screen.queryByText(/reads as a par/)).toBeNull();
    expect(screen.queryByText(/adds up to/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Use these pars' }));
    expect(applied[0].holes[2].par).toBe(3);
  });

  it('says when there were no printed totals and when the indexes were dropped', async () => {
    const raw = rawRowSet({
      printed_par_out: null,
      printed_par_in: null,
      printed_par_total: null,
      holes: PARS.map((par, i) => ({ number: i + 1, par, stroke_index: 1 })),
    });
    const { scan } = show(() => reply(rawScan([raw])));
    await scan();
    expect(await screen.findByText('No printed totals in the photo to check against.')).toBeTruthy();
    expect(screen.getByText(/The stroke indexes didn't read cleanly, so they were left out/)).toBeTruthy();
  });

  it('says a back nine sets up a nine-hole round', async () => {
    const { scan } = show(() => reply(rawScan([rawRowSet({}, { first: 10, n: 9 })])));
    await scan();
    expect(
      await screen.findByText(/This photo shows holes 10–18 only. Using it sets up a 9-hole round. To play 18, get both nines in one photo./)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Par for hole 10: 4' })).toBeTruthy();
  });

  it.each([
    [() => new Response(JSON.stringify({ ok: false, error: 'not_configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } }), "Card scanning isn't switched on yet. Enter the pars below, or search for the course."],
    [() => new Response(null, { status: 429 }), "That's a lot of scans in a few minutes. Give it a few minutes and try again."],
    [() => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), "Card scanning isn't available right now. Enter the pars below."],
    [() => new Response(JSON.stringify({ ok: false, error: 'no_card' }), { status: 422, headers: { 'Content-Type': 'application/json' } }), "That doesn't look like a scorecard. Get the whole hole-by-hole table in the frame and try again."],
  ])('says what went wrong in the status line, and opens nothing', async (res, message) => {
    const { scan } = show(res);
    await scan();
    const status = await screen.findByText(message);
    expect(status.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Cancel without applying anything', async () => {
    const { scan, user, applied } = show(() => reply(rawScan([rawRowSet()])));
    await scan();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(applied).toHaveLength(0);
  });
});
