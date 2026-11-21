/**
 * Builds public/courses/opengolfapi-us.json — the offline course list that
 * course search falls back to when api.opengolfapi.org does not answer.
 *
 *   npm run courses:snapshot                 # download, verify, build
 *   npm run courses:snapshot -- --from FILE  # build from an already-downloaded .ndjson.gz
 *
 * Source: the OpenGolfAPI open-data dump (https://github.com/opengolfapi/data),
 * pinned to one commit so the same command always builds the same file. The
 * download is checked against that commit's SHA256SUMS before a byte of it is
 * read; a mismatch stops the build. To take a newer dump, change COMMIT,
 * rerun, and commit the regenerated JSON.
 *
 * The dump is ODbL 1.0. This file is a derived database, so it ships under the
 * same licence, is served publicly at /courses/opengolfapi-us.json, and this
 * script is how anyone can rebuild it from the source.
 *
 * What is kept, per course, as one array (sorted by name, so a rebuild with
 * the same input is byte-identical):
 *
 *   [name, city, state, par, pars, strokeIndexes?]
 *
 *   - city and state are "" when the dump has none; par is 0 when unknown.
 *   - pars is one character per hole, hole 1 first: the par digit, or "." for
 *     a hole the dump has no entry for. Its length is the course's hole
 *     count (9 or 18), inferred below because the dump's own `holes` field is
 *     only the number of scorecard entries it happens to have. "" means no
 *     scorecard at all.
 *   - strokeIndexes is present only when every hole has one. A partial set is
 *     dropped: handicap allocation needs the whole set or none.
 *
 * Everything else (ids, coordinates, phone numbers, yardage, OSM ids) is left
 * out; none of it is used by Trunk, and the file has to stay small enough to
 * fetch on a weak signal.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'opengolfapi/data';
const COMMIT = 'f41c0fa30484e64ccef1e75a24e4599fd26c83c5';
const FILE = 'opengolfapi-us.ndjson.gz';
const OUT = path.join(root, 'public', 'courses', 'opengolfapi-us.json');
const raw = (name) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${name}`;

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function load() {
  const sums = (await download(raw('SHA256SUMS'))).toString('utf8');
  const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${FILE}`));
  if (!line) throw new Error(`SHA256SUMS at ${COMMIT} has no entry for ${FILE}`);
  const expected = line.split(/\s+/)[0];

  const at = process.argv.indexOf('--from');
  const gz = at > 0 ? readFileSync(process.argv[at + 1]) : await download(raw(FILE));
  const actual = createHash('sha256').update(gz).digest('hex');
  if (actual !== expected) {
    throw new Error(`${FILE}: sha256 ${actual} does not match SHA256SUMS (${expected})`);
  }
  return { gz, sha256: actual };
}

/**
 * How many holes the course has. Hole numbers past 9 settle it; otherwise the
 * listed par does (no nine-hole course is par 54 or more, no eighteen under
 * it). Fourteen courses list a nine-hole par beside holes numbered 10–18, and
 * the hole numbers are the likelier truth.
 */
function holeCount(par, maxHole) {
  if (maxHole > 9) return 18;
  if (maxHole > 0 || par) return par >= 54 ? 18 : 9;
  return 0;
}

function pack(props) {
  const card = Array.isArray(props.scorecard) ? props.scorecard : [];
  const byHole = new Map();
  for (const h of card) {
    if (Number.isInteger(h?.hole) && h.hole >= 1 && h.hole <= 18) byHole.set(h.hole, h);
  }
  const par = Number.isInteger(props.par) ? props.par : 0;
  // A listed par with no scorecard at all is not enough to build a card from;
  // it ships as "no scorecard", which the app already handles.
  const n = byHole.size ? holeCount(par, Math.max(...byHole.keys())) : 0;

  let pars = '';
  const si = [];
  for (let hole = 1; hole <= n; hole++) {
    const h = byHole.get(hole);
    const p = h?.par;
    pars += Number.isInteger(p) && p >= 1 && p <= 9 ? String(p) : '.';
    si.push(Number.isInteger(h?.handicap_index) && h.handicap_index > 0 ? h.handicap_index : null);
  }
  const row = [String(props.name ?? '').trim(), props.city ?? '', props.state ?? '', par, pars];
  if (n > 0 && !pars.includes('.') && si.every((v) => v !== null)) row.push(si);
  return row;
}

const { gz, sha256 } = await load();
const rows = gunzipSync(gz)
  .toString('utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => pack(JSON.parse(l).properties ?? {}))
  .filter((r) => r[0])
  .sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : `${a[2]}${a[1]}`.localeCompare(`${b[2]}${b[1]}`)
  );

const out = {
  format: 1,
  attribution: 'Contains data from OpenGolfAPI (opengolfapi.org). © OpenStreetMap contributors.',
  license: 'ODbL-1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
  source: `https://github.com/${REPO}/blob/${COMMIT}/${FILE}`,
  sha256,
  builtBy: 'scripts/course-snapshot.mjs (https://github.com/thetechjam/trunk-golf)',
  fields: ['name', 'city', 'state', 'par', 'pars', 'strokeIndexes?'],
  courses: rows,
};
const json = JSON.stringify(out);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, json);

const scored = rows.filter((r) => r[4]).length;
const whole = rows.filter((r) => r[4] && !r[4].includes('.')).length;
console.log(
  `${path.relative(root, OUT)}: ${rows.length} courses (${scored} with a scorecard, ${whole} complete), ` +
    `${(json.length / 1024).toFixed(0)} KB raw, ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB gzipped`
);
