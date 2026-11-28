import { describe, it, expect } from 'vitest';
import { makeRound } from './games/testFixtures';
import {
  cellLabel,
  cellState,
  editSpoken,
  editText,
  pickupsWith,
  restoreCell,
  sameCell,
  undoLabel,
  undoneText,
  type CellState,
} from './scoreEdit';

const num = (score: number): CellState => ({ score, x: false });
const blank: CellState = { score: null, x: false };
const X: CellState = { score: 9, x: true };

const round = makeRound({
  scores: { 1: { p1: 5, p2: 9 }, 2: { p1: 4 } },
  pickups: { 1: ['p2'] },
});

describe('cellState', () => {
  it('reads a number, a blank and an X', () => {
    expect(cellState(round, 1, 'p1')).toEqual(num(5));
    expect(cellState(round, 2, 'p2')).toEqual(blank);
    expect(cellState(round, 3, 'p1')).toEqual(blank);
    expect(cellState(round, 1, 'p2')).toEqual(X);
  });

  it('tells a 9 from an X', () => {
    expect(sameCell(num(9), X)).toBe(false);
    expect(sameCell(num(4), num(4))).toBe(true);
    expect(sameCell(blank, { score: null, x: false })).toBe(true);
  });
});

describe('pickupsWith', () => {
  it('sets and clears one player, dropping empty holes and an empty map', () => {
    expect(pickupsWith(round, 1, 'p1', true)).toEqual({ 1: ['p2', 'p1'] });
    expect(pickupsWith(round, 1, 'p2', false)).toBeUndefined();
    expect(pickupsWith(round, 4, 'p1', true)).toEqual({ 1: ['p2'], 4: ['p1'] });
  });
});

describe('restoreCell', () => {
  it('number → number', () => {
    const next = restoreCell(round, 1, 'p1', num(6));
    expect(cellState(next, 1, 'p1')).toEqual(num(6));
    expect(next.scores[2]).toBe(round.scores[2]);
    expect(next.pickups).toEqual({ 1: ['p2'] });
  });

  it('blank → number and number → blank', () => {
    const filled = restoreCell(round, 2, 'p2', num(3));
    expect(cellState(filled, 2, 'p2')).toEqual(num(3));
    expect(cellState(restoreCell(filled, 2, 'p2', blank), 2, 'p2')).toEqual(blank);
  });

  it('X → number deletes the emptied pickups map', () => {
    const next = restoreCell(round, 1, 'p2', num(5));
    expect(cellState(next, 1, 'p2')).toEqual(num(5));
    expect('pickups' in next).toBe(false);
  });

  it('number → X sets the flag and the 9', () => {
    const next = restoreCell(round, 1, 'p1', X);
    expect(cellState(next, 1, 'p1')).toEqual(X);
    expect(next.pickups).toEqual({ 1: ['p2', 'p1'] });
  });

  it('leaves the round it was given alone', () => {
    restoreCell(round, 1, 'p2', num(5));
    expect(round.pickups).toEqual({ 1: ['p2'] });
    expect(round.scores[1]).toEqual({ p1: 5, p2: 9 });
  });
});

describe('the toast copy', () => {
  it('labels a number, a blank and an X', () => {
    expect(cellLabel(num(5))).toBe('5');
    expect(cellLabel(blank)).toBe('–');
    expect(cellLabel(X)).toBe('X');
  });

  it('shows the change with an arrow', () => {
    expect(editText('Mike', 5, num(5), num(4))).toBe('Mike, hole 5: 5 → 4');
    expect(editText('Mike', 5, blank, num(4))).toBe('Mike, hole 5: – → 4');
    expect(editText('Mike', 5, num(4), blank)).toBe('Mike, hole 5: 4 → –');
    expect(editText('Mike', 5, num(6), X)).toBe('Mike, hole 5: 6 → X');
    expect(editText('Mike', 5, X, num(5))).toBe('Mike, hole 5: X → 5');
  });

  it('says the change in words', () => {
    expect(editSpoken('Mike', 5, num(5), num(4))).toBe(
      'Mike, hole 5 changed from 5 to 4. Undo is available.'
    );
    expect(editSpoken('Mike', 5, blank, num(4))).toBe(
      'Mike, hole 5 changed from no score to 4. Undo is available.'
    );
    expect(editSpoken('Mike', 5, num(6), X)).toBe(
      'Mike, hole 5 changed from 6 to picked up. Undo is available.'
    );
  });

  it('confirms the undo', () => {
    expect(undoneText('Mike', 5, num(5))).toBe('Mike, hole 5 is back to 5.');
    expect(undoneText('Mike', 5, X)).toBe('Mike, hole 5 is back to X.');
    expect(undoneText('Mike', 5, blank)).toBe('Mike, hole 5 is blank again.');
  });

  it('names the Undo button', () => {
    expect(undoLabel('Mike', 5, num(5))).toBe('Undo: put Mike, hole 5 back to 5');
    expect(undoLabel('Mike', 5, X)).toBe('Undo: put Mike, hole 5 back to X');
    expect(undoLabel('Mike', 5, blank)).toBe('Undo: clear Mike, hole 5');
  });
});
