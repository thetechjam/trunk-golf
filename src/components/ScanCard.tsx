import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Hole } from '../types';
import type { FetchedCourse } from '../courses/openGolfApi';
import { assessRowSet, rowSetToCourse, type ScannedRowSet, type TotalMismatch } from '../courses/scanGate';
import { prepareScanImage, ScanImageError } from '../courses/scanImage';
import { scanCard, ScanError, SCAN_MESSAGES, type ScanReading } from '../courses/scanCard';
import { isNative } from '../native';
import { CameraIcon } from '../icons';
import { Sheet } from './Sheet';
import { ParGrid } from './ParGrid';

interface Props {
  /** The course name typed on New Round, if any. It wins over the one on the card. */
  courseName: string;
  /** Called once, with the row the user picked and checked, on the final tap. */
  onApply: (course: FetchedCourse) => void;
}

/**
 * "Scan the card": photograph the course's printed scorecard and have the
 * pars and stroke indexes read off it.
 *
 * Nothing reaches New Round until the user has seen the numbers beside their
 * photo and tapped to use them. A model can read a 4 as a 7 or a ladies' row
 * as the men's, and a par out by one changes every net score of the round, so
 * the reading is offered for checking — never filled in.
 *
 * Hidden in the native shell: its web view loads the app from its own bundle,
 * where there is no /api/scan-card to talk to.
 */
export function ScanCard(props: Props) {
  if (isNative()) return null;
  return <ScanCardInner {...props} />;
}

type Status = { text: string; error?: boolean };

function ScanCardInner({ courseName, onApply }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ text: '' });
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ reading: ScanReading; photoUrl: string } | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const hintId = useId();

  // A scan still running when the screen goes away is abandoned, and the
  // photo's object URL is given back.
  const photoUrl = review?.photoUrl;
  useEffect(() => () => inflight.current?.abort(), []);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const pick = () => input.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setBusy(true);
    setStatus({ text: 'Getting the photo ready…' });
    try {
      const photo = await prepareScanImage(file);
      if (ctrl.signal.aborted) return;
      setStatus({ text: 'Reading the card…' });
      const reading = await scanCard(photo, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const n = reading.rowSets.length;
      setStatus({
        text: n === 1 ? 'Read the card. Check it against the photo.' : `Read ${n} rows from the card. Pick the one you're playing.`,
      });
      setReview({ reading, photoUrl: URL.createObjectURL(photo) });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const message =
        err instanceof ScanError
          ? err.message
          : err instanceof ScanImageError
            ? SCAN_MESSAGES[err.code]
            : SCAN_MESSAGES.internal;
      setStatus({ text: message, error: true });
    } finally {
      if (inflight.current === ctrl) {
        inflight.current = null;
        setBusy(false);
      }
    }
  };

  const close = () => setReview(null);

  return (
    <div className="scan-card">
      <button
        type="button"
        className="btn-secondary scan-btn"
        onClick={pick}
        disabled={busy}
        aria-describedby={hintId}
      >
        <CameraIcon size={18} /> Scan the card
      </button>
      <p className="hint" id={hintId}>
        Photograph the printed scorecard. Trunk reads the pars and stroke indexes for you to check.
      </p>
      {/* No `capture` attribute: with it, phones open the camera only, and a
          photo of the card taken earlier — or a screenshot of the course's
          own card — could not be picked. */}
      <input
        ref={input}
        className="scan-input"
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-label="Photo of the scorecard"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same photo again still fires a change.
          e.target.value = '';
          void onFile(file);
        }}
      />
      {/* Always mounted, as in CourseSearch: a live region inserted with its
          text already in it is missed by many screen readers. */}
      <p className={`cs-status${status.error ? ' cs-error' : ''}`} role="status">
        {status.text}
      </p>
      {review && (
        <ConfirmSheet
          reading={review.reading}
          photoUrl={review.photoUrl}
          typedName={courseName}
          onClose={close}
          onScanAgain={() => {
            // Closed first, synchronously: while the sheet is a modal dialog
            // the rest of the page — the file input included — is inert.
            flushSync(() => setReview(null));
            setStatus({ text: '' });
            pick();
          }}
          onApply={(course) => {
            close();
            setStatus({ text: '' });
            onApply(course);
          }}
        />
      )}
    </div>
  );
}

const AUDIENCE_WORD: Record<ScannedRowSet['audience'], string | null> = {
  men: "Men's",
  women: "Ladies'",
  all: 'All players',
  unknown: null,
};

const parTotal = (holes: Hole[]) => holes.reduce((s, h) => s + h.par, 0);

function mismatchLine(m: TotalMismatch): string {
  const what = m.which === 'out' ? 'Front nine adds' : m.which === 'in' ? 'Back nine adds' : 'The holes add';
  return `${what} up to ${m.sum}; the card prints ${m.printed}.`;
}

function rowSummary(rs: ScannedRowSet): string {
  // Tees already named in the label ("Blue / White") are not said twice.
  const label = rs.label.toLowerCase();
  const tees = rs.tees.filter((t) => !label.includes(t.toLowerCase()));
  return [
    tees.length ? tees.join(', ') : null,
    AUDIENCE_WORD[rs.audience],
    `par ${parTotal(rs.holes)}`,
    rs.holes.every((h) => h.strokeIndex !== undefined) ? 'with stroke index' : 'par only',
  ]
    .filter(Boolean)
    .join(' · ');
}

interface SheetProps {
  reading: ScanReading;
  photoUrl: string;
  typedName: string;
  onClose: () => void;
  onScanAgain: () => void;
  onApply: (course: FetchedCourse) => void;
}

function ConfirmSheet({ reading, photoUrl, typedName, onClose, onScanAgain, onApply }: SheetProps) {
  const { rowSets } = reading;
  // With more than one row nothing is chosen for the user: picking the men's
  // row for a ladies' round is the misread this card exists to stop.
  const [chosen, setChosen] = useState<number | null>(rowSets.length === 1 ? 0 : null);
  const [holes, setHoles] = useState<Hole[]>(() => (rowSets.length === 1 ? rowSets[0].holes.map((h) => ({ ...h })) : []));
  const [name, setName] = useState(typedName.trim() || reading.courseName);
  const [big, setBig] = useState(false);
  const groupName = useId();

  const choose = (i: number) => {
    setChosen(i);
    setHoles(rowSets[i].holes.map((h) => ({ ...h })));
  };

  const edited: ScannedRowSet | null = chosen === null ? null : { ...rowSets[chosen], holes };
  // Re-read on every render, so a fixed par clears its own flag.
  const assessment = edited ? assessRowSet(edited) : null;
  const flagged = new Set(assessment?.badPars ?? []);
  const withSi = chosen !== null && rowSets[chosen].holes.every((h) => h.strokeIndex !== undefined);

  return (
    <Sheet title="Check the card" onClose={onClose}>
      <div className="scan-review">
        <button
          type="button"
          className={`scan-photo${big ? ' big' : ''}`}
          aria-pressed={big}
          onClick={() => setBig((b) => !b)}
        >
          <img src={photoUrl} alt="Your photo of the scorecard" />
        </button>

        <div className="scan-fields">
          {rowSets.length > 1 && (
            <fieldset className="scan-rows">
              <legend>Which row are you playing?</legend>
              {rowSets.map((rs, i) => (
                <label key={i} className={`scan-row${chosen === i ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name={groupName}
                    checked={chosen === i}
                    onChange={() => choose(i)}
                  />
                  <span className="scan-row-text">
                    <span className="scan-row-label">{rs.label || `Row ${i + 1}`}</span>
                    <span className="scan-row-detail">{rowSummary(rs)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {edited && assessment && (
            <>
              <label className="field">
                <span>Course name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
              </label>

              {edited.holeCount === 9 && (
                <p className="hint-inline">
                  This photo shows holes {edited.firstHole === 10 ? '10–18' : '1–9'} only. Using it sets up a
                  9-hole round. To play 18, get both nines in one photo.
                </p>
              )}

              <ParGrid
                holes={holes}
                withStrokeIndex={withSi}
                maxStrokeIndex={18}
                flaggedPars={flagged}
                onPar={(number, par) => setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, par } : h)))}
                onStrokeIndex={(number, si) =>
                  setHoles((hs) => hs.map((h) => (h.number === number ? { ...h, strokeIndex: si } : h)))
                }
              />

              <div className="scan-flags" role="status">
                {assessment.badPars.length > 0 && (
                  <p className="scan-flag bad">
                    {assessment.badPars.length === 1
                      ? `Hole ${assessment.badPars[0]} reads as a par no hole has.`
                      : `Holes ${assessment.badPars.join(', ')} read as pars no hole has.`}{' '}
                    Tap to fix against the photo before using these.
                  </p>
                )}
                {assessment.totals.map((m) => (
                  <p key={m.which} className="scan-flag">
                    {mismatchLine(m)}
                  </p>
                ))}
                {assessment.noTotals && (
                  <p className="scan-flag muted">No printed totals in the photo to check against.</p>
                )}
                {assessment.siDropped && (
                  <p className="scan-flag muted">
                    The stroke indexes didn't read cleanly, so they were left out. Add them under Holes &amp;
                    pars if you play net games.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="scan-actions">
            {edited && assessment && (
              <button
                type="button"
                className="btn-primary big"
                disabled={assessment.badPars.length > 0}
                onClick={() => onApply(rowSetToCourse(edited, name.trim()))}
              >
                {assessment.totals.length > 0 ? 'Use these anyway' : 'Use these pars'}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onScanAgain}>
              Scan again
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
