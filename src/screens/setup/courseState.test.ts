import { describe, it, expect } from 'vitest';
import { sliceCourseHoles } from '../../courses/openGolfApi';
import { realCard18 } from '../../games/testFixtures';
import {
  courseToSave,
  mergeNineIntoCard,
  courseReducer,
  deriveCourse,
  initialCourseState,
} from './courseState';

describe('mergeNineIntoCard', () => {
  it('gives back the card unchanged when the nine was not edited', () => {
    const card = realCard18();
    for (const nine of ['front', 'back'] as const) {
      expect(mergeNineIntoCard(card, sliceCourseHoles(card, 9, { nine }), nine)).toEqual(card);
    }
  });

  it('writes a back nine into the last nine of a 27-hole card, not holes 10–18', () => {
    const card = [...realCard18(), ...realCard18().slice(0, 9).map((h) => ({ ...h, number: h.number + 18 }))];
    const back = sliceCourseHoles(card, 9, { nine: 'back' }).map((h) => ({ ...h, par: 6 }));
    const out = mergeNineIntoCard(card, back, 'back');
    expect(out.slice(18).every((h) => h.par === 6)).toBe(true);
    expect(out.slice(0, 18)).toEqual(card.slice(0, 18));
  });

  it('keeps the card’s stroke indexes when the nine’s are not a full ranking', () => {
    const card = realCard18();
    const front = sliceCourseHoles(card, 9).map((h) => ({ ...h, strokeIndex: 1 }));
    expect(mergeNineIntoCard(card, front, 'front').map((h) => h.strokeIndex)).toEqual(
      card.map((h) => h.strokeIndex)
    );
  });
});

describe('courseToSave', () => {
  const base = { name: 'X', nine: 'front' as const, slope: 120, existing: undefined };

  it('drops a rating that covers a different number of holes than are saved', () => {
    const out = courseToSave({
      ...base,
      holes: realCard18().slice(0, 9),
      source: null,
      rating: 72,
      ratingHoles: 18,
    });
    expect('refused' in out ? null : out.rating).toBeUndefined();
  });

  it('keeps the saved card’s rating when the one on screen was typed for the nine', () => {
    const card = realCard18();
    const out = courseToSave({
      ...base,
      holes: sliceCourseHoles(card, 9),
      source: card,
      rating: 36,
      ratingHoles: 9,
      existing: { id: 'c', name: 'X', holes: card, rating: 72.4 },
    });
    expect('refused' in out ? null : [out.holes.length, out.rating]).toEqual([18, 72.4]);
  });
});

describe('a course from the offline list', () => {
  // Eighteen holes, 17 and 18 missing from the list; listed as par 72, adds up to 70.
  const offline = {
    id: 'offline:0',
    name: 'Offline Links',
    holes: [4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 3, 3, 4, 4].map((par, i) => ({ number: i + 1, par })),
    hasStrokeIndex: false,
    offline: true,
    estimated: [17, 18],
    listedPar: 72,
  };
  const loaded = courseReducer(
    { ...initialCourseState, holeCount: 18 },
    { type: 'loadSearch', course: offline }
  );

  it('loads the whole card and says which holes to check', () => {
    expect(loaded.holes).toHaveLength(18);
    expect(loaded.savedNote?.text).toBe('Loaded "Offline Links" from the offline list — par only');
    expect(deriveCourse(loaded).importIssues.slice(0, 2)).toEqual([
      'Holes 17 and 18 are missing from the offline course list, so they are set to par 4.',
      'The card adds up to par 70; the course is listed as par 72.',
    ]);
  });

  it('drops a hole from the list once its par is set by hand', () => {
    const fixed = courseReducer(
      courseReducer(loaded, { type: 'par', number: 17, par: 5 }),
      { type: 'par', number: 18, par: 5 }
    );
    expect(deriveCourse(fixed).importIssues).toEqual([]);
  });

  it('keeps the note to the nine being played', () => {
    const back = courseReducer(courseReducer(loaded, { type: 'holeCount', count: 9 }), {
      type: 'nine',
      nine: 'back',
    });
    expect(back.holes.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(deriveCourse(back).importIssues[0]).toBe(
      'Holes 17 and 18 are missing from the offline course list, so they are set to par 4.'
    );
    const front = courseReducer(loaded, { type: 'holeCount', count: 9 });
    expect(deriveCourse(front).importIssues).toEqual([]);
  });
});
