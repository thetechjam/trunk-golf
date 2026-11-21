import type { Hole } from '../types';
import type { FetchedCourse } from './openGolfApi';
import { MIN_PAR, MAX_PAR } from './validate';

/**
 * The checks between a vision model's reading of a scorecard photo and the
 * New Round screen.
 *
 * Shared by the Netlify function (`netlify/lib/scanCard/`) and the browser on
 * purpose. The server uses it to decide whether a reading is good enough to
 * stop at or worth a second, stronger model; the browser re-runs the live part
 * (`assessRowSet`) on every edit in the confirm card, so a fixed par clears its
 * own flag. The server only ever returns data — the flags are always worked
 * out here, on both sides, so they cannot disagree.
 *
 * No DOM and no network: it runs in Node and in a browser unchanged.
 *
 * Everything that arrives is treated as untrusted. Structured outputs make the
 * model's JSON schema-shaped, but the server still has to survive a reply cut
 * short, and the browser still has to survive a server it is talking to
 * through a proxy. So nothing here throws on bad input; a row set it cannot
 * make sense of is simply not offered.
 */

export type Audience = 'men' | 'women' | 'all' | 'unknown';

export interface ScannedRowSet {
  /** The row's name as printed ("Blue / White", "Ladies"), trimmed and capped. */
  label: string;
  audience: Audience;
  /** Tee names the row applies to, as printed. */
  tees: string[];
  holeCount: 9 | 18;
  /** 10 only for a nine-hole set that is the back nine of a card. */
  firstHole: 1 | 10;
  /**
   * Numbered as printed: a back nine keeps 10–18. `strokeIndex` is absent on
   * every hole when the indexes were missing or did not survive the checks.
   */
  holes: Hole[];
  /** The Out / In / Total the card prints for this row, when it prints them. */
  printed: { out: number | null; in: number | null; total: number | null };
  /** True when the card had stroke indexes and they were thrown away as unreliable. */
  siDropped: boolean;
}

export interface GateResult {
  /** False only when the model said this is not a printed scorecard. */
  found: boolean;
  /** Every row set passed every check; a second reading would add nothing. */
  clean: boolean;
  courseName: string;
  rowSets: ScannedRowSet[];
}

/** A printed total that does not match the holes above it. */
export interface TotalMismatch {
  which: 'out' | 'in' | 'total';
  sum: number;
  printed: number;
}

export interface RowSetAssessment {
  /** Hole numbers whose par is outside MIN_PAR..MAX_PAR. Blocks applying. */
  badPars: number[];
  totals: TotalMismatch[];
  /** The card printed no total this row could be checked against. */
  noTotals: boolean;
  siDropped: boolean;
  /** Nothing to flag at all. */
  clean: boolean;
}

/** Row sets offered at most. A card with more than this is not being read well. */
export const MAX_ROW_SETS = 6;
/** Longest label, tee or course name kept. */
export const MAX_TEXT = 60;
/** Raw row sets looked at, so a runaway reply cannot make this loop long. */
const MAX_RAW_ROW_SETS = 12;
const MAX_TEES = 8;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * A printed string made safe to show and to key on: control characters out,
 * whitespace collapsed, capped. React escapes what it renders; this is about
 * not carrying a 4,000-character "label" into the layout.
 */
export function cleanText(v: unknown): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const stripped = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.slice(0, MAX_TEXT).trim();
}

const AUDIENCES: readonly Audience[] = ['men', 'women', 'all', 'unknown'];

const optionalInt = (v: unknown): number | null => (isInt(v) ? v : null);

/**
 * Whether a set of stroke indexes is a ranking worth keeping.
 *
 * An eighteen must be 1..18 once each. A nine may be 1..9, or nine distinct
 * values out of 1..18 — the front nine of a card is printed with its odd
 * eighteen-hole ranks, and `sliceCourseHoles` re-ranks those to 1..9 when the
 * card is applied. The one shape that passes those tests and is still wrong is
 * the hole number copied down a row ("1, 2, 3 …"): that is what a model
 * produces when it reads the hole-number row as the index row.
 */
function strokeIndexesHold(holes: { number: number; si: number }[], holeCount: number): boolean {
  const values = holes.map((h) => h.si);
  if (new Set(values).size !== values.length) return false;
  const max = holeCount === 9 ? 18 : holeCount;
  if (values.some((v) => v < 1 || v > max)) return false;
  if (holeCount === 18 && values.length !== 18) return false;
  if (holes.every((h) => h.si === h.number)) return false;
  return true;
}

/**
 * One raw row set into a checked one, or null when its shape is wrong enough
 * that no edit in the confirm card could sensibly fix it: the wrong number of
 * holes (Out, In and Total read as holes 10, 20 and 21), a gap or repeat in
 * the numbering, or a non-number where a par should be.
 */
function readRowSet(raw: unknown): ScannedRowSet | null {
  if (!isObject(raw)) return null;
  const holeCount = raw.hole_count;
  if (holeCount !== 9 && holeCount !== 18) return null;
  if (!Array.isArray(raw.holes) || raw.holes.length !== holeCount) return null;

  const parsed: { number: number; par: number; si: unknown }[] = [];
  for (const h of raw.holes) {
    if (!isObject(h) || !isInt(h.number) || !isInt(h.par)) return null;
    parsed.push({ number: h.number, par: h.par, si: h.stroke_index });
  }
  parsed.sort((a, b) => a.number - b.number);
  const first = parsed[0].number;
  // A nine is the front (1–9) or the back (10–18). Anything else — a nine
  // starting at hole 5 — is a misread table, not a layout.
  if (first !== 1 && !(holeCount === 9 && first === 10)) return null;
  if (parsed.some((h, i) => h.number !== first + i)) return null;

  const sis = parsed.map((h) => h.si);
  const allNull = sis.every((v) => v == null);
  const allInt = sis.every(isInt);
  const keepSi =
    !allNull &&
    allInt &&
    strokeIndexesHold(
      parsed.map((h) => ({ number: h.number, si: h.si as number })),
      holeCount
    );

  const holes: Hole[] = parsed.map((h) =>
    keepSi ? { number: h.number, par: h.par, strokeIndex: h.si as number } : { number: h.number, par: h.par }
  );

  const audience = AUDIENCES.includes(raw.audience as Audience) ? (raw.audience as Audience) : 'unknown';
  const tees = Array.isArray(raw.tees)
    ? [...new Set(raw.tees.map(cleanText).filter(Boolean))].slice(0, MAX_TEES)
    : [];

  return {
    label: cleanText(raw.label),
    audience,
    tees,
    holeCount,
    firstHole: first === 10 ? 10 : 1,
    holes,
    printed: {
      out: optionalInt(raw.printed_par_out),
      in: optionalInt(raw.printed_par_in),
      total: optionalInt(raw.printed_par_total),
    },
    siDropped: !allNull && !keepSi,
  };
}

const sum = (holes: Hole[]) => holes.reduce((s, h) => s + h.par, 0);

/**
 * The live flags on a row set, from the pars and indexes as they stand.
 *
 * Re-run by the confirm card on every edit, so it reads only `holes`,
 * `printed` and the sticky `siDropped` — nothing the server decided.
 *
 * Which printed figures apply: on an eighteen, Out is holes 1–9, In is 10–18
 * and Total is all of them. On a nine, the figure for that nine (Out on a
 * front, In on a back) is checked; its Total is checked only when that figure
 * is missing, because a photo of one nine of an eighteen-hole card often shows
 * the whole course's Total beside it.
 */
export function assessRowSet(rs: ScannedRowSet): RowSetAssessment {
  const badPars = rs.holes.filter((h) => h.par < MIN_PAR || h.par > MAX_PAR).map((h) => h.number);
  const totals: TotalMismatch[] = [];
  const check = (which: TotalMismatch['which'], holes: Hole[], printed: number | null) => {
    if (printed == null) return false;
    const s = sum(holes);
    if (s !== printed) totals.push({ which, sum: s, printed });
    return true;
  };

  let checked = false;
  if (rs.holeCount === 18) {
    const out = check('out', rs.holes.filter((h) => h.number <= 9), rs.printed.out);
    const inn = check('in', rs.holes.filter((h) => h.number >= 10), rs.printed.in);
    const total = check('total', rs.holes, rs.printed.total);
    checked = out || inn || total;
  } else {
    const nine = rs.firstHole === 10 ? rs.printed.in : rs.printed.out;
    checked = check(rs.firstHole === 10 ? 'in' : 'out', rs.holes, nine);
    if (!checked) checked = check('total', rs.holes, rs.printed.total);
  }

  return {
    badPars,
    totals,
    noTotals: !checked,
    siDropped: rs.siDropped,
    clean: badPars.length === 0 && totals.length === 0 && !rs.siDropped,
  };
}

/** Same numbers on every hole: the men's and ladies' rows of a card that does not differ. */
const sameHoles = (a: ScannedRowSet, b: ScannedRowSet) =>
  a.holeCount === b.holeCount &&
  a.firstHole === b.firstHole &&
  a.holes.every((h, i) => h.par === b.holes[i].par && h.strokeIndex === b.holes[i].strokeIndex);

function merge(a: ScannedRowSet, b: ScannedRowSet): ScannedRowSet {
  const labels = [a.label, b.label].filter(Boolean);
  return {
    ...a,
    label: [...new Set(labels)].join(' / ').slice(0, MAX_TEXT).trim(),
    audience: a.audience === b.audience ? a.audience : 'all',
    tees: [...new Set([...a.tees, ...b.tees])].slice(0, MAX_TEES),
    printed: {
      out: a.printed.out ?? b.printed.out,
      in: a.printed.in ?? b.printed.in,
      total: a.printed.total ?? b.printed.total,
    },
    siDropped: a.siDropped && b.siDropped,
  };
}

/**
 * The model's reply, checked. Never throws: garbage reads as found-but-empty,
 * which the server treats as a failed attempt and the client as nothing to
 * show.
 *
 * `found` is false only for an explicit `found: false` — the model saying the
 * photo is not a scorecard — because that is the one answer a second model
 * should not be asked to second-guess.
 */
export function checkScan(raw: unknown): GateResult {
  if (!isObject(raw)) return { found: true, clean: false, courseName: '', rowSets: [] };
  if (raw.found === false) return { found: false, clean: false, courseName: '', rowSets: [] };

  const rawSets = Array.isArray(raw.row_sets) ? raw.row_sets.slice(0, MAX_RAW_ROW_SETS) : [];
  const rowSets: ScannedRowSet[] = [];
  let rejected = false;
  for (const r of rawSets) {
    const rs = readRowSet(r);
    if (!rs) {
      rejected = true;
      continue;
    }
    const twin = rowSets.findIndex((other) => sameHoles(other, rs));
    if (twin >= 0) rowSets[twin] = merge(rowSets[twin], rs);
    else rowSets.push(rs);
  }
  const kept = rowSets.slice(0, MAX_ROW_SETS);

  return {
    found: true,
    // A rejected row set makes the reading unclean even when others survived:
    // a table read wrongly in one place is worth a second look in all of them.
    clean: kept.length > 0 && !rejected && kept.every((rs) => assessRowSet(rs).clean),
    courseName: cleanText(raw.course_name),
    rowSets: kept,
  };
}

/**
 * A confirmed row set as the course loader's input, so the scanned card goes
 * through exactly the checks and slicing a searched one does.
 *
 * `listedPar` is the figure the pars should add up to for the holes in the
 * set — the Total on an eighteen, the nine's own figure on a nine — so the
 * card's printed total keeps checking the holes after they are applied.
 */
export function rowSetToCourse(rs: ScannedRowSet, name: string): FetchedCourse {
  const listed =
    rs.holeCount === 18
      ? rs.printed.total
      : ((rs.firstHole === 10 ? rs.printed.in : rs.printed.out) ?? rs.printed.total);
  return {
    id: 'scan',
    name,
    holes: rs.holes.map((h) => ({ ...h })),
    hasStrokeIndex: rs.holes.every((h) => typeof h.strokeIndex === 'number'),
    listedPar: listed ?? undefined,
  };
}

/**
 * The row sets in a server reply, re-checked in the browser.
 *
 * The server ran these through `checkScan` already, but the browser does not
 * take that on trust: a reply can be mangled on the way, or come from an
 * older deploy. Each is put back into the model's shape and through the same
 * structural checks; `siDropped` is carried, since the indexes it describes
 * are already gone.
 */
export function reviveRowSets(v: unknown): ScannedRowSet[] {
  if (!Array.isArray(v)) return [];
  const out: ScannedRowSet[] = [];
  for (const r of v.slice(0, MAX_ROW_SETS)) {
    if (!isObject(r) || !Array.isArray(r.holes)) continue;
    const printed = isObject(r.printed) ? r.printed : {};
    const rs = readRowSet({
      label: r.label,
      audience: r.audience,
      tees: r.tees,
      hole_count: r.holeCount,
      holes: r.holes.map((h) => (isObject(h) ? { number: h.number, par: h.par, stroke_index: h.strokeIndex ?? null } : h)),
      printed_par_out: printed.out,
      printed_par_in: printed.in,
      printed_par_total: printed.total,
    });
    if (rs) out.push({ ...rs, siDropped: rs.siDropped || r.siDropped === true });
  }
  return out;
}
