/** Test fixtures for the scorecard scan, shared by the gate, handler and screen tests. */

/**
 * Fixtures in the shape the model is asked for (snake_case, as in
 * netlify/lib/scanCard/prompt.ts). A real par-72 card, ranked odd on the
 * front and even on the back.
 */
export const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
export const SI = [5, 1, 15, 7, 11, 3, 17, 9, 13, 6, 2, 16, 8, 12, 4, 18, 10, 14];
export const LADIES_PARS = [4, 5, 3, 5, 4, 4, 3, 4, 5, 4, 5, 3, 5, 4, 4, 3, 4, 5];

export function rawRowSet(over: Record<string, unknown> = {}, opts: { first?: number; n?: number } = {}) {
  const n = opts.n ?? 18;
  const first = opts.first ?? 1;
  const holes = Array.from({ length: n }, (_, i) => ({
    number: first + i,
    par: PARS[first - 1 + i],
    stroke_index: SI[first - 1 + i],
  }));
  const sum = (from: number, to: number) =>
    holes.filter((h) => h.number >= from && h.number <= to).reduce((s, h) => s + h.par, 0);
  return {
    label: 'Men',
    audience: 'men',
    tees: ['Blue', 'White'],
    hole_count: n,
    holes,
    printed_par_out: first === 1 ? sum(1, 9) : null,
    printed_par_in: n === 18 || first === 10 ? sum(10, 18) : null,
    printed_par_total: n === 18 ? 72 : null,
    ...over,
  };
}

export function rawScan(rowSets: unknown[], over: Record<string, unknown> = {}) {
  return { found: true, course_name: 'Pine Valley', notes: '', row_sets: rowSets, ...over };
}
