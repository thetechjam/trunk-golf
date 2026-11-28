import { useState } from 'react';
import { stakeAmount, MAX_STAKE } from '../numberInput';

interface Props {
  /** The stored stake; undefined shows the empty box with its 0 placeholder. */
  value: number | undefined;
  /** Called with a settleable amount only — always a stakeAmount() result. */
  onCommit: (amount: number) => void;
  'aria-label'?: string;
}

/**
 * One `$` stake field: the bare input, no wrapper, so each caller supplies
 * its own label, `$` and unit around it.
 *
 * The text being typed is shown as typed, and only a stake that can be
 * settled is stored (see stakeAmount): a cleared box stays empty mid-edit, and
 * a "-" or "1e9" never reaches the money. The draft lives only while the field
 * has focus, so two fields bound to the same stake (a game tile and the Money
 * row) always agree once neither is being typed in.
 */
export function StakeInput({ value, onCommit, 'aria-label': ariaLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      max={MAX_STAKE}
      inputMode="decimal"
      value={draft ?? value ?? ''}
      placeholder="0"
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const v = stakeAmount(raw);
        if (v != null) onCommit(v);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
