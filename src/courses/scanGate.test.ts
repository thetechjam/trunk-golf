import { describe, it, expect } from 'vitest';
import { assessRowSet, checkScan, cleanText, reviveRowSets, rowSetToCourse, type ScannedRowSet } from './scanGate';
import { sliceCourseHoles } from './openGolfApi';
import { PARS, SI, LADIES_PARS, rawRowSet, rawScan } from './scanFixtures';

describe('checkScan', () => {
  it('passes a clean eighteen with matching totals and a full stroke index', () => {
    const g = checkScan(rawScan([rawRowSet()]));
    expect(g.found).toBe(true);
    expect(g.clean).toBe(true);
    expect(g.courseName).toBe('Pine Valley');
    expect(g.rowSets).toHaveLength(1);
    const rs = g.rowSets[0];
    expect(rs.holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 5 });
    expect(rs.printed).toEqual({ out: 36, in: 36, total: 72 });
    expect(rs.siDropped).toBe(false);
  });

  it("keeps men's and ladies' rows apart when their numbers differ", () => {
    const ladies = rawRowSet({
      label: 'Ladies',
      audience: 'women',
      tees: ['Red'],
      holes: LADIES_PARS.map((par, i) => ({ number: i + 1, par, stroke_index: SI[i] })),
      printed_par_out: 37,
      printed_par_in: 37,
      printed_par_total: 74,
    });
    const g = checkScan(rawScan([rawRowSet(), ladies]));
    expect(g.clean).toBe(true);
    expect(g.rowSets.map((r) => r.label)).toEqual(['Men', 'Ladies']);
    expect(g.rowSets[1].audience).toBe('women');
  });

  it('merges row sets with identical numbers and joins their labels', () => {
    const g = checkScan(
      rawScan([rawRowSet({ label: 'Blue', tees: ['Blue'] }), rawRowSet({ label: 'White', tees: ['White'], audience: 'women' })])
    );
    expect(g.rowSets).toHaveLength(1);
    expect(g.rowSets[0].label).toBe('Blue / White');
    expect(g.rowSets[0].tees).toEqual(['Blue', 'White']);
    expect(g.rowSets[0].audience).toBe('all');
  });

  it('rejects a set where Out, In and Total were read as holes', () => {
    const holes = [
      ...PARS.slice(0, 9).map((par, i) => ({ number: i + 1, par, stroke_index: null })),
      { number: 10, par: 36, stroke_index: null },
      ...PARS.slice(9).map((par, i) => ({ number: 11 + i, par, stroke_index: null })),
      { number: 20, par: 36, stroke_index: null },
      { number: 21, par: 72, stroke_index: null },
    ];
    const g = checkScan(rawScan([rawRowSet({ hole_count: 18, holes })]));
    expect(g.rowSets).toEqual([]);
    expect(g.clean).toBe(false);
    expect(g.found).toBe(true);
  });

  it('keeps but flags a par of 36 on a hole', () => {
    const raw = rawRowSet();
    (raw.holes as { par: number }[])[9].par = 36;
    const g = checkScan(rawScan([raw]));
    expect(g.clean).toBe(false);
    const a = assessRowSet(g.rowSets[0]);
    expect(a.badPars).toEqual([10]);
    expect(a.clean).toBe(false);
  });

  it('flags a handwritten 7 read as a par and the totals that no longer add up', () => {
    const raw = rawRowSet();
    (raw.holes as { par: number }[])[2].par = 7;
    const g = checkScan(rawScan([raw]));
    const a = assessRowSet(g.rowSets[0]);
    expect(a.badPars).toEqual([3]);
    expect(a.totals).toEqual([
      { which: 'out', sum: 40, printed: 36 },
      { which: 'total', sum: 76, printed: 72 },
    ]);
  });

  it('drops a stroke index with a duplicate', () => {
    const raw = rawRowSet();
    (raw.holes as { stroke_index: number }[])[1].stroke_index = 5;
    const rs = checkScan(rawScan([raw])).rowSets[0];
    expect(rs.siDropped).toBe(true);
    expect(rs.holes.every((h) => h.strokeIndex === undefined)).toBe(true);
  });

  it('drops a stroke index out of range', () => {
    const raw = rawRowSet();
    (raw.holes as { stroke_index: number }[])[1].stroke_index = 19;
    expect(checkScan(rawScan([raw])).rowSets[0].siDropped).toBe(true);
  });

  it('drops a stroke index that is just the hole numbers again', () => {
    const raw = rawRowSet({
      holes: PARS.map((par, i) => ({ number: i + 1, par, stroke_index: i + 1 })),
    });
    const g = checkScan(rawScan([raw]));
    expect(g.rowSets[0].siDropped).toBe(true);
    expect(g.clean).toBe(false);
  });

  it('drops a stroke index read on only half the holes', () => {
    const raw = rawRowSet({
      holes: PARS.map((par, i) => ({ number: i + 1, par, stroke_index: i < 9 ? SI[i] : null })),
    });
    expect(checkScan(rawScan([raw])).rowSets[0].siDropped).toBe(true);
  });

  it('treats a card with no stroke index row as par only, not as dropped', () => {
    const raw = rawRowSet({ holes: PARS.map((par, i) => ({ number: i + 1, par, stroke_index: null })) });
    const g = checkScan(rawScan([raw]));
    expect(g.rowSets[0].siDropped).toBe(false);
    expect(g.clean).toBe(true);
  });

  it("keeps a front nine's odd eighteen-hole ranks, which re-rank on apply", () => {
    const g = checkScan(rawScan([rawRowSet({}, { n: 9 })]));
    expect(g.clean).toBe(true);
    const rs = g.rowSets[0];
    expect(rs.firstHole).toBe(1);
    expect(rs.holes.map((h) => h.strokeIndex)).toEqual(SI.slice(0, 9));
    const course = rowSetToCourse(rs, 'Pine Valley');
    const applied = sliceCourseHoles(course.holes, 9);
    expect(applied.map((h) => h.strokeIndex).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Hole 2 is SI 1 on the card, and still the hardest of the nine.
    expect(applied[1].strokeIndex).toBe(1);
  });

  it('keeps a back nine numbered 10–18', () => {
    const g = checkScan(rawScan([rawRowSet({}, { first: 10, n: 9 })]));
    const rs = g.rowSets[0];
    expect(rs.firstHole).toBe(10);
    expect(rs.holes.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(assessRowSet(rs).clean).toBe(true);
    expect(rowSetToCourse(rs, 'x').listedPar).toBe(36);
  });

  it('rejects a nine starting at hole 5', () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({ number: 5 + i, par: 4, stroke_index: null }));
    expect(checkScan(rawScan([rawRowSet({ hole_count: 9, holes })])).rowSets).toEqual([]);
  });

  it('rejects a gap or a repeat in the numbering', () => {
    const gap = rawRowSet();
    (gap.holes as { number: number }[])[4].number = 40;
    const dupe = rawRowSet();
    (dupe.holes as { number: number }[])[4].number = 4;
    expect(checkScan(rawScan([gap])).rowSets).toEqual([]);
    expect(checkScan(rawScan([dupe])).rowSets).toEqual([]);
  });

  it('accepts a card with no printed totals and says it could not check', () => {
    const raw = rawRowSet({ printed_par_out: null, printed_par_in: null, printed_par_total: null });
    const g = checkScan(rawScan([raw]));
    expect(g.rowSets).toHaveLength(1);
    expect(assessRowSet(g.rowSets[0]).noTotals).toBe(true);
    expect(g.clean).toBe(true);
  });

  it('reports found:false without row sets', () => {
    expect(checkScan({ found: false, course_name: null, notes: '', row_sets: [rawRowSet()] })).toEqual({
      found: false,
      clean: false,
      courseName: '',
      rowSets: [],
    });
  });

  it.each([
    ['null', null],
    ['a string', 'not json'],
    ['an array', [1, 2, 3]],
    ['missing row sets', { found: true }],
    ['row sets not a list', { found: true, row_sets: 'x' }],
    ['strings for numbers', rawScan([rawRowSet({ hole_count: '18' })])],
    ['a par as a string', rawScan([rawRowSet({ holes: PARS.map((p, i) => ({ number: i + 1, par: String(p) })) })])],
    ['a fractional par', rawScan([rawRowSet({ holes: PARS.map((p, i) => ({ number: i + 1, par: p + 0.5 })) })])],
    ['holes as null', rawScan([rawRowSet({ holes: null })])],
    ['a hole as null', rawScan([rawRowSet({ holes: [null, ...PARS.slice(1)] })])],
  ])('never throws on %s', (_, raw) => {
    expect(() => checkScan(raw)).not.toThrow();
    expect(checkScan(raw).rowSets).toEqual([]);
  });

  it('caps and cleans text', () => {
    const g = checkScan(
      rawScan([rawRowSet({ label: `  Blue\u0000\u0007 ${'x'.repeat(500)}`, tees: ['  Red\n', 42, ''] })], {
        course_name: 'A\u0001B',
      })
    );
    expect(g.rowSets[0].label.length).toBeLessThanOrEqual(60);
    expect(g.rowSets[0].label.startsWith('Blue x')).toBe(true);
    expect(g.rowSets[0].tees).toEqual(['Red']);
    expect(g.courseName).toBe('A B');
    expect(cleanText(42)).toBe('');
  });

  it('keeps at most six row sets and drops notes', () => {
    const sets = Array.from({ length: 9 }, (_, k) =>
      rawRowSet({ holes: PARS.map((par, i) => ({ number: i + 1, par: i === 0 ? 3 + (k % 4) : par, stroke_index: SI[i] })), label: `R${k}` })
    );
    // Nine distinct par sets would merge to four (hole 1 cycles 3..6), so
    // vary a second hole too.
    sets.forEach((s, k) => ((s.holes as { par: number }[])[1].par = 3 + Math.floor(k / 4)));
    const g = checkScan(rawScan(sets));
    expect(g.rowSets.length).toBe(6);
    expect('notes' in g).toBe(false);
  });

  it('is not clean when one row set was rejected and another kept', () => {
    const bad = rawRowSet({ hole_count: 9 });
    const g = checkScan(rawScan([rawRowSet(), bad]));
    expect(g.rowSets).toHaveLength(1);
    expect(g.clean).toBe(false);
  });
});

describe('assessRowSet', () => {
  const base = (): ScannedRowSet => checkScan(rawScan([rawRowSet()])).rowSets[0];

  it('clears a flag once the par is fixed', () => {
    const rs = base();
    rs.holes[3] = { ...rs.holes[3], par: 9 };
    expect(assessRowSet(rs).clean).toBe(false);
    rs.holes[3] = { ...rs.holes[3], par: 5 };
    expect(assessRowSet(rs).clean).toBe(true);
  });

  it('checks a nine against its total only when its own figure is missing', () => {
    const nine = checkScan(rawScan([rawRowSet({ printed_par_out: null, printed_par_total: 72 }, { n: 9 })])).rowSets[0];
    expect(assessRowSet(nine).totals).toEqual([{ which: 'total', sum: 36, printed: 72 }]);
  });
});

describe('rowSetToCourse', () => {
  it('hands over the holes as a loader input', () => {
    const rs = checkScan(rawScan([rawRowSet()])).rowSets[0];
    const c = rowSetToCourse(rs, 'Pine Valley');
    expect(c).toMatchObject({ id: 'scan', name: 'Pine Valley', hasStrokeIndex: true, listedPar: 72 });
    expect(c.holes).toHaveLength(18);
    expect(c.holes).not.toBe(rs.holes);
  });

  it('leaves listedPar out when the card printed no total', () => {
    const rs = checkScan(
      rawScan([rawRowSet({ printed_par_out: null, printed_par_in: null, printed_par_total: null })])
    ).rowSets[0];
    expect(rowSetToCourse(rs, 'x').listedPar).toBeUndefined();
  });
});

describe('reviveRowSets', () => {
  it('round-trips what the server sends', () => {
    const g = checkScan(rawScan([rawRowSet(), rawRowSet({}, { first: 10, n: 9 })]));
    const wire = JSON.parse(JSON.stringify(g.rowSets));
    expect(reviveRowSets(wire)).toEqual(g.rowSets);
  });

  it('keeps siDropped and drops anything malformed', () => {
    const rs = { ...checkScan(rawScan([rawRowSet()])).rowSets[0], siDropped: true };
    expect(reviveRowSets([rs, { holes: 'x' }, null, 7])).toEqual([rs]);
    expect(reviveRowSets('nope')).toEqual([]);
  });
});
