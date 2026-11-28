import { useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { CoinIcon, FlagIcon, ScrambleIcon } from '../icons';

interface Props {
  /** The X, the scrim, Escape or a drag on the sheet's grabber or header. */
  onClose: () => void;
  /** "Start a round" on the last card. */
  onStart: () => void;
  /** "Full rules": the long How to Play text, which stays under Settings. */
  onRules: () => void;
}

const VIDEO = 'https://youtu.be/bUL6qcGF6XI';

const CARDS = [
  {
    Icon: ScrambleIcon,
    title: 'Add the group',
    text: 'Names and handicaps, the games you’re playing, and a stake on each.',
  },
  {
    Icon: FlagIcon,
    title: 'Tap the scores',
    text: 'One phone, one tap per player. The money moves every hole.',
  },
  {
    Icon: CoinIcon,
    title: 'Settle up',
    text: 'Trunk works out the fewest payments. Share it to the group chat.',
  },
] as const;

const LAST = CARDS.length - 1;

/**
 * A Start tap this soon after the cards change is the second half of a double
 * tap on Next, which sat in the same place a moment ago — not a decision.
 */
const START_GUARD_MS = 350;

/**
 * "How Trunk works": three short cards for somebody who has not played a
 * round yet, opened from "New here?" on an empty Home.
 *
 * One card at a time, moved by Back and Next or a sideways swipe. The sheet's
 * title stays the same throughout, so Sheet does not pull focus back to the
 * panel on each card; the card's own text is a polite live region instead.
 * The long rules are a link away rather than repeated here.
 */
export function Walkthrough({ onClose, onStart, onRules }: Props) {
  const [step, setStep] = useState(0);
  const changedAt = useRef(0);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const walk = useRef<HTMLDivElement>(null);
  // Next, or "Start a round" in its place on the last card.
  const primaryBtn = useRef<HTMLButtonElement>(null);
  // What had focus inside the cards when the step changed, if anything.
  const focusedAt = useRef<Element | null>(null);

  const go = (to: number) => {
    const next = Math.max(0, Math.min(LAST, to));
    if (next === step) return;
    changedAt.current = performance.now();
    const active = document.activeElement;
    focusedAt.current = active && walk.current?.contains(active) ? active : null;
    setStep(next);
  };

  // A step change can take away the button that had focus: Next gives way to
  // "Start a round" on the last card (and back again), and Back is hidden on
  // the first. Focus would drop to the page, so it goes to the primary button.
  useLayoutEffect(() => {
    const was = focusedAt.current;
    focusedAt.current = null;
    if (was && (!was.isConnected || was.closest('[aria-hidden="true"]'))) {
      primaryBtn.current?.focus();
    }
  }, [step]);

  const onTouchStart = (e: React.TouchEvent) => {
    // The sheet would otherwise start drag-to-dismiss from the same touch;
    // with no start recorded, its move and end handlers do nothing.
    e.stopPropagation();
    const t = e.changedTouches[0];
    swipeFrom.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // The same test the Hole tab uses: decisively sideways, or nothing.
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      go(step + (dx < 0 ? 1 : -1));
    }
  };

  const card = CARDS[step];
  const Icon = card.Icon;

  return (
    <Sheet title="How Trunk works" onClose={onClose}>
      <div
        ref={walk}
        className="walk"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeFrom.current = null;
        }}
      >
        <div className="walk-card" aria-live="polite">
          <div className="walk-icon">
            <Icon size={36} />
          </div>
          <p className="walk-step">
            {step + 1} of {CARDS.length}
          </p>
          <h3 className="walk-title">{card.title}</h3>
          <p className="walk-text">{card.text}</p>
        </div>

        <div className="walk-dots" aria-hidden="true">
          {CARDS.map((c, i) => (
            <span key={c.title} className={`walk-dot${i === step ? ' on' : ''}`} />
          ))}
        </div>

        <div className="walk-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => go(step - 1)}
            // Hidden rather than removed on the first card, so the row does
            // not shift; `visibility` also takes it out of the tab order and
            // the accessibility tree.
            style={step === 0 ? { visibility: 'hidden' } : undefined}
            aria-hidden={step === 0 || undefined}
            tabIndex={step === 0 ? -1 : undefined}
          >
            Back
          </button>
          {step < LAST ? (
            <button
              key="next"
              ref={primaryBtn}
              type="button"
              className="btn-primary"
              onClick={() => go(step + 1)}
            >
              Next
            </button>
          ) : (
            <button
              key="start"
              ref={primaryBtn}
              type="button"
              className="btn-primary"
              onClick={() => {
                if (performance.now() - changedAt.current < START_GUARD_MS) return;
                onStart();
              }}
            >
              Start a round
            </button>
          )}
        </div>

        <div className="walk-links">
          <a href={VIDEO} target="_blank" rel="noopener noreferrer">
            Watch the 80-second video ↗
          </a>
          <button type="button" className="walk-rules" onClick={onRules}>
            Full rules ›
          </button>
        </div>
      </div>
    </Sheet>
  );
}
