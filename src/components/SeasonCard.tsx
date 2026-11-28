import type { Season } from '../season';
import { formatSignedMoney } from '../games/settlement';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  season: Season;
  /** Whether `season.year` is the calendar year on the phone right now. */
  current: boolean;
  /** The player's badge colour, as their card below draws it. */
  colorFor: (name: string, i: number) => string;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Sign and colour together, so the figure never relies on colour alone. */
function Net({ n }: { n: number | null }) {
  if (n == null) return <span className="season-net">—</span>;
  if (n === 0) return <span className="season-net">Even</span>;
  return <span className={`season-net ${n > 0 ? 'up' : 'down'}`}>{formatSignedMoney(n)}</span>;
}

/**
 * The year's money on the Stats screen: everyone's net, then the regular
 * crew head to head.
 *
 * Head to head is read from what a round stores — each player's net for the
 * round — not from who paid whom, which the rounds do not record. So it says
 * who finished ahead in the rounds two people both played for money, and
 * what each of them won or lost in those rounds. In a two-player round that
 * is exactly the money between them.
 */
export function SeasonCard({ season, current, colorFor }: Props) {
  const heading = current ? 'This season' : `${season.year} season`;
  return (
    <section className="stat-card season" aria-labelledby="season-h">
      <div className="season-head">
        <h2 id="season-h">{heading}</h2>
        <span className="season-count">
          {current ? `${season.year} · ` : ''}
          {plural(season.rounds, 'round')}
        </span>
      </div>

      <ul className="season-money">
        {season.players.map((p, i) => (
          <li key={p.key}>
            <PlayerAvatar name={p.name} color={colorFor(p.name, i)} size={28} />
            <span className="season-who">{p.name}</span>
            <span className="season-rounds">{plural(p.rounds, 'round')}</span>
            <Net n={p.money} />
          </li>
        ))}
      </ul>
      <p className="season-note">
        Net money over {plural(season.moneyRounds, 'round')} with stakes.
        {season.leagueNights > 0 && ' League nights not counted.'}
      </p>

      {season.pairs.length > 0 && (
        <>
          <h3>Head to head</h3>
          <ul className="season-h2h">
            {season.pairs.map((pr) => (
              <li key={`${pr.a}|${pr.b}`}>
                <div className="season-h2h-row">
                  <span className="season-who">
                    {pr.a} v {pr.b}
                  </span>
                  <span className="season-record">
                    {pr.aWins}–{pr.bWins}
                    {pr.even > 0 ? `, ${pr.even} even` : ''}
                  </span>
                </div>
                <div className="season-h2h-sub">
                  {plural(pr.shared, 'round')} together · {pr.a}{' '}
                  {pr.aNet === 0 ? 'even' : formatSignedMoney(pr.aNet)}, {pr.b}{' '}
                  {pr.bNet === 0 ? 'even' : formatSignedMoney(pr.bNet)}
                </div>
              </li>
            ))}
          </ul>
          <p className="season-note">
            Rounds both played for money: who finished ahead, and what each won or lost in them.
          </p>
        </>
      )}
    </section>
  );
}
