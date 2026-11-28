// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StakeInput } from './StakeInput';

/** One field with its stake held the way Setup holds options.stakes. */
function Harness({ seen, initial }: { seen: number[]; initial?: number }) {
  const [stake, setStake] = useState<number | undefined>(initial);
  return (
    <StakeInput
      value={stake}
      aria-label="Skins stake, $ per skin"
      onCommit={(v) => {
        seen.push(v);
        setStake(v);
      }}
    />
  );
}

/** Two fields bound to one stake, so a commit in one must show in the other. */
function Pair() {
  const [stake, setStake] = useState<number | undefined>(5);
  return (
    <>
      <StakeInput value={stake} aria-label="tile" onCommit={setStake} />
      <StakeInput value={stake} aria-label="money" onCommit={setStake} />
      <button type="button">elsewhere</button>
    </>
  );
}

afterEach(cleanup);

describe('StakeInput', () => {
  it('commits a decimal stake as typed', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Harness seen={seen} />);
    await user.type(screen.getByRole('spinbutton'), '2.5');
    expect(seen.at(-1)).toBe(2.5);
  });

  it('never commits a negative stake', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Harness seen={seen} />);
    await user.type(screen.getByRole('spinbutton'), '-5');
    expect(seen.every((v) => v >= 0)).toBe(true);
    expect(seen.at(-1)).toBe(0);
  });

  it('lets the box be cleared and retyped without a stray 0', async () => {
    const user = userEvent.setup();
    render(<Harness seen={[]} />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton');
    await user.type(field, '5');
    await user.clear(field);
    expect(field.value).toBe('');
    await user.type(field, '3');
    expect(field.value).toBe('3');
  });

  it('reverts a draft that is not a stake to the stored value on blur', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Harness seen={seen} initial={4} />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton');
    await user.clear(field);
    await user.type(field, '-');
    // Clearing commits 0 (a blank box is no stake); the lone "-" commits nothing.
    expect(seen).toEqual([0]);
    await user.tab();
    expect(field.value).toBe('0');
  });

  it('shows a changed value from elsewhere when not focused', async () => {
    const user = userEvent.setup();
    render(<Pair />);
    const tile = screen.getByLabelText<HTMLInputElement>('tile');
    const money = screen.getByLabelText<HTMLInputElement>('money');
    expect(tile.value).toBe('5');
    await user.clear(money);
    await user.type(money, '3');
    expect(tile.value).toBe('3');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(money.value).toBe('3');
    expect(tile.value).toBe('3');
  });

  it('carries the given accessible name', () => {
    render(<Harness seen={[]} />);
    expect(screen.getByLabelText('Skins stake, $ per skin')).toBeTruthy();
  });
});
