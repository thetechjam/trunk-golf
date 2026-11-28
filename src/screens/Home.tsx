import { useState } from 'react';
import type { Round } from '../types';
import { listRounds } from '../storage';
import { count } from '../plural';
import { HomeScreenCard, HomeScreenTip, InstallPrompt, homeScreenCardDue } from '../components/InstallPrompt';
import { RoundCard } from '../components/RoundCard';
import { ResumeCard } from '../components/ResumeCard';
import { TripCard } from '../components/TripCard';
import { PlayAgainCard } from '../components/PlayAgainCard';
import { playAgainRound } from '../playAgain';
import { activeTrip } from '../trips';
import { liveRound } from '../roundSummary';
import { FlagIcon, TrunkMark, TrophyIcon, GearIcon, ChartIcon, ScrambleIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { Walkthrough } from '../components/Walkthrough';
import { KeepRoundsPrompt, keepRoundsPromptDue } from '../components/KeepRoundsPrompt';
import { MovedNotice } from '../components/MovedNotice';
import { BringRoundsOver } from '../components/BringRoundsOver';
import { countsForStats } from '../stats';

/**
 * How many rounds Home shows before handing over to the history.
 *
 * Home is a launcher: the two buttons at the top are what somebody opened the
 * app to press, and an unbounded archive underneath them pushes those further
 * from the thumb with every round played. Five covers the round you are
 * part-way through and the last few you might want to look at again; anything
 * older is a search, which is what the history screen is for.
 */
const ON_HOME = 5;

/**
 * The one message about keeping rounds that Home shows on this visit.
 *
 * The backup card, the Home Screen card and the grey tip each made sense
 * alone; stacked, they were three warnings before the user's own rounds. So
 * Home picks one when it opens, in this order: a due backup, then (in a
 * Safari tab that can be wiped) how to add Trunk to the Home Screen, then the
 * browser one-liner, which is null wherever it does not apply.
 *
 * Picked once rather than on every render, so answering one card never
 * uncovers another in the same visit.
 */
type Surface = 'backup' | 'home-screen' | 'tip';

function pickSurface(): Surface {
  if (keepRoundsPromptDue()) return 'backup';
  if (homeScreenCardDue()) return 'home-screen';
  return 'tip';
}

interface Props {
  onNew: () => void;
  onNewLeague: () => void;
  /** Absent where there is nowhere to go, e.g. in tests that do not need it. */
  onNewScramble?: () => void;
  onResume: (round: Round) => void;
  onViewResults: (round: Round) => void;
  onStats: () => void;
  onHistory: () => void;
  onTrip?: (tripId: string) => void;
  /** Opens New Round filled in from this round. Absent, Home offers no Play again. */
  onPlayAgain?: (round: Round) => void;
}

export function Home({
  onNew,
  onNewLeague,
  onNewScramble,
  onResume,
  onViewResults,
  onStats,
  onHistory,
  onTrip,
  onPlayAgain,
}: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds);
  // Bumped when Settings backs up or restores, so the backup reminder
  // re-reads its status rather than showing a stale count.
  const [nudgeKey, setNudgeKey] = useState(0);
  const [surface, setSurface] = useState<Surface>(pickSurface);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<'settings' | 'help'>('settings');
  const [showWalk, setShowWalk] = useState(false);

  const openHelp = () => {
    setSettingsView('help');
    setShowSettings(true);
  };

  // The live round gets its own card up top, so it is not listed twice; the
  // list gives up one slot for it and Home stays at ON_HOME rounds in all.
  const live = liveRound(rounds);
  const rest = live ? rounds.filter((r) => r !== live) : rounds;
  const listed = rest.slice(0, live ? ON_HOME - 1 : ON_HOME);
  const trip = activeTrip(rounds);
  // Never beside the Resume card: playAgainRound is null while a round is live.
  const again = onPlayAgain ? playAgainRound(rounds) : null;

  return (
    <div className="screen home">
      <header className="hero">
        <button
          className="hero-settings"
          onClick={() => {
            setSettingsView('settings');
            setShowSettings(true);
          }}
          aria-label="Settings"
        >
          <GearIcon size={20} />
        </button>
        {/* The wordmark is Home's page title, so it is the <h1> — every other
            screen has one, and without this Home's outline opened at <h2>.
            The word is real text beside a decorative mark, so the heading's
            accessible name is simply "Trunk". tabIndex so App can move focus
            here on navigation. */}
        <h1 className="logo" tabIndex={-1}>
          <TrunkMark size={42} className="logo-mark" />
          <span className="logo-type">Trunk</span>
        </h1>
        <p className="tagline">Settle it at the trunk.</p>
      </header>

      {/* Only on the old pressgolf.netlify.app address; nothing anywhere else. */}
      <MovedNotice />

      {live && <ResumeCard round={live} onResume={() => onResume(live)} />}

      {trip && onTrip && <TripCard trip={trip} onOpen={() => onTrip(trip.id)} />}

      {/* Mid-round, the Resume card is the thing to press; a second filled
          button under it would be two primaries arguing. League night is the
          weekly special case, so it rides alongside rather than taking a
          second full-width slab of equal weight. Scramble is the same kind of
          occasion — an event format, not the everyday round — so it takes the
          same tile. */}
      <div className={`home-actions${onNewScramble ? ' three' : ''}`}>
        <button className={live ? 'btn-secondary big' : 'btn-primary big'} onClick={onNew}>
          Start New Round
        </button>
        {/* The visible word is in the name, so voice control still finds it.
            The line under it says what the format is and is the button's
            description, not part of its name. */}
        <button
          className="btn-secondary big home-league"
          onClick={onNewLeague}
          aria-label="Golf League"
          aria-describedby="home-league-sub"
        >
          <span className="home-action-main">
            <TrophyIcon size={20} />
            League
          </span>
          <span className="home-action-sub" id="home-league-sub">
            A weekly <span className="home-action-keep">2-on-2</span> night
          </span>
        </button>
        {onNewScramble && (
          <button
            className="btn-secondary big home-league"
            onClick={onNewScramble}
            aria-label="Scramble"
            aria-describedby="home-scramble-sub"
          >
            <span className="home-action-main">
              <ScrambleIcon size={20} />
              Scramble
            </span>
            <span className="home-action-sub" id="home-scramble-sub">
              Everyone hits, best ball
            </span>
          </button>
        )}
      </div>

      {/* Part of the launcher, so directly under its tiles and above any
          message about installing or backing up. */}
      {again && onPlayAgain && <PlayAgainCard round={again} onPlay={() => onPlayAgain(again)} />}

      <InstallPrompt />

      {/* Home already offers Install above. The prompt's own button would be a second one. */}
      {surface === 'backup' && <KeepRoundsPrompt key={nudgeKey} offerInstall={false} />}

      {rounds.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <FlagIcon size={40} />
          </div>
          <p className="empty-title">No rounds yet</p>
          <p className="empty-sub">Start your first round and Trunk keeps score for you.</p>
          <button className="btn-ghost empty-help" onClick={() => setShowWalk(true)}>
            New here? See how it works ›
          </button>
          {/* An empty Home Screen app on Apple devices: the rounds may be in Safari. */}
          <BringRoundsOver onRestored={() => setRounds(listRounds())} />
        </div>
      )}

      {rest.length > 0 && (
        <section className="saved">
          <div className="saved-head">
            <h2>Your rounds</h2>
            {/* Offered only once there is a round finished enough to count —
                a Stats screen that can only say "nothing yet" is a dead end
                dressed up as a destination. */}
            {rounds.some(countsForStats) && (
              <button className="btn-ghost saved-stats" onClick={onStats}>
                <ChartIcon size={15} /> Stats
              </button>
            )}
          </div>
          {listed.map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              onOpen={() => (r.status === 'finished' ? onViewResults(r) : onResume(r))}
            />
          ))}

          {/* Always offered, not only past ON_HOME: deleting lives in the
              history now, so it has to be reachable with two rounds saved. */}
          {rest.length > 0 && (
            <button className="btn-ghost saved-all" onClick={onHistory}>
              All {count(rounds.length, 'round')} ›
            </button>
          )}
        </section>
      )}

      {/* In the flow under the rounds (or the empty state), never a banner above them. */}
      {surface === 'home-screen' && <HomeScreenCard hasRounds={rounds.length > 0} />}
      {surface === 'tip' && <HomeScreenTip />}

      {showWalk && (
        <Walkthrough
          onClose={() => setShowWalk(false)}
          onStart={() => {
            setShowWalk(false);
            onNew();
          }}
          onRules={() => {
            setShowWalk(false);
            openHelp();
          }}
        />
      )}

      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          screen="home"
          initialView={settingsView}
          // A restore from this sheet used to leave "No rounds yet" on the
          // screen behind it until the next navigation.
          onDataChanged={() => {
            setRounds(listRounds());
            setNudgeKey((k) => k + 1);
            setSurface(pickSurface());
          }}
        />
      )}
    </div>
  );
}
