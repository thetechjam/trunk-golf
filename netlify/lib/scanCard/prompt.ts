/**
 * What the model is told and the shape it must answer in.
 *
 * The schema is sent as structured outputs (`output_config.format`), so the
 * reply is schema-shaped JSON. It uses only keywords structured outputs
 * accepts: `additionalProperties: false` and `required` on every object,
 * `enum`, and `anyOf` with null for the fields a card may not print. Range
 * limits (`minimum`, `maxItems`) are not supported there, and are enforced
 * where they matter anyway — `checkScan` in src/courses/scanGate.ts.
 */

const nullableInt = { anyOf: [{ type: 'integer' }, { type: 'null' }] } as const;

export const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'course_name', 'notes', 'row_sets'],
  properties: {
    found: { type: 'boolean' },
    course_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { type: 'string' },
    row_sets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'label',
          'audience',
          'tees',
          'hole_count',
          'holes',
          'printed_par_out',
          'printed_par_in',
          'printed_par_total',
        ],
        properties: {
          label: { type: 'string' },
          audience: { type: 'string', enum: ['men', 'women', 'all', 'unknown'] },
          tees: { type: 'array', items: { type: 'string' } },
          hole_count: { type: 'integer', enum: [9, 18] },
          holes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['number', 'par', 'stroke_index'],
              properties: {
                number: { type: 'integer' },
                par: { type: 'integer' },
                stroke_index: nullableInt,
              },
            },
          },
          printed_par_out: nullableInt,
          printed_par_in: nullableInt,
          printed_par_total: nullableInt,
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You read photos of golf course scorecards for a scorekeeping app. The user will check every number you return against the photo before using it, so an honest gap is better than a confident guess.

Read only the PRINTED table of the scorecard: the hole numbers, the par row or rows, and the handicap / stroke index row or rows. Ignore anything handwritten — players' names, scores, ticks, circled numbers, totals written in pen. A number written in pen over a printed cell is not the printed value.

Rules:
- If the photo is not of a printed golf scorecard, or no hole-by-hole par row is visible, set found to false and return an empty row_sets list.
- Out, In and Total (also Front, Back, Tot, Gross) are summary columns, not holes. Put the par printed in those columns into printed_par_out, printed_par_in and printed_par_total, and never into holes. Use null for any of them the card does not print or you cannot read.
- Return one row set for each distinct pair of par row and handicap row on the card — for example one for men's tees and one for ladies' tees when their pars or handicaps differ. Return at most 6 row sets. Name each with the label printed beside the row, list the tee names it applies to, and set audience to men, women, all or unknown from what the card says.
- hole_count is 18 when the photo shows all eighteen holes, or 9 when it shows only one nine. Number holes exactly as printed: a back nine on its own is holes 10 to 18.
- stroke_index comes only from a row labelled Handicap, HCP, HDCP, Index, Stroke Index, S.I. or SI. If there is no such row for this row set, or a cell is unreadable, use null for that hole. Yardage rows, hole numbers and slope or rating figures are never stroke indexes.
- Never guess a cell. If a par cannot be read with confidence, leave that row set out rather than invent a value.
- course_name is the course name printed on the card, or null if none is visible.
- notes is one short sentence about anything that made the card hard to read, or an empty string.`;

export const USER_TEXT =
  'Read the printed par and stroke index rows from this scorecard photo.';
