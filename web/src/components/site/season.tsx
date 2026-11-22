import type { CSSProperties } from "react";
import { PointsChart } from "@/components/site/points-chart";
import { D, SectionHead, V } from "@/components/ui/reveal";
import { Portrait } from "@/components/ui/portrait";
import { driver, site, team } from "@/lib/data";

/** The 2026 season: standings, the points race round by round, and who has it sewn up. */
export function Season() {
  const s = site.season;
  const leader = s.drivers[0];
  const second = s.drivers[1];
  const teamLeader = s.constructors[0];
  const teamSecond = s.constructors[1];
  const left = s.rounds - s.after_round;
  const champ = driver(leader.driver_id);
  // Clinch status comes from the title simulator, which counts every point still available.
  const decided = s.clinched?.drivers === leader.driver_id;
  const teamDecided = s.clinched?.constructors === teamLeader.constructor_id;

  return (
    <section id="season" className="theme-day section" aria-labelledby="season-h">
      <div className="wrap">
        <SectionHead
          id="season-h"
          tag={`${s.season} season · after round ${s.after_round} of ${s.rounds}`}
          lines={[
            <V key="a">The title,</V>,
            <D key="b">race by race</D>,
          ]}
          lede={`Real points after every round, from the official results. ${left} race${left === 1 ? "" : "s"} to go.`}
        />

        <div className="mb-16 grid gap-4 md:grid-cols-2">
          {[
            {
              kicker: decided ? "Drivers' champion" : "Drivers' leader",
              who: champ.name,
              colour: team(champ.team_now).colour,
              lead: leader.points - second.points,
              pts: leader.points,
              note: decided ? "Mathematically decided" : "Still open",
              d: champ,
            },
            {
              kicker: teamDecided ? "Constructors' champion" : "Constructors' leader",
              who: team(teamLeader.constructor_id).name,
              colour: team(teamLeader.constructor_id).colour,
              lead: teamLeader.points - teamSecond.points,
              pts: teamLeader.points,
              note: teamDecided ? "Mathematically decided" : "Still open",
              d: null,
            },
          ].map((c, i) => (
            <article
              key={c.kicker}
              data-reveal="fade"
              style={{ "--c": c.colour, "--i": i } as CSSProperties}
              className="panel relative grid min-h-[260px] grid-cols-[minmax(0,1fr)_auto] overflow-hidden"
            >
              <div className="flex flex-col justify-between gap-6 p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-sub">{c.kicker}</span>
                  <span className={`pill ${c.note === "Still open" ? "mute" : "hit"}`}>{c.note}</span>
                </div>
                <div>
                  <p className="type-voice text-[clamp(34px,4vw,52px)] leading-none">{c.who}</p>
                  <p className="mt-4 flex gap-8 font-mono text-sm">
                    <span>
                      <b className="type-data block text-3xl font-medium">{c.pts}</b>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-sub">Points</span>
                    </span>
                    <span>
                      <b className="type-data block text-3xl font-medium text-gain">+{c.lead}</b>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-sub">Lead</span>
                    </span>
                  </p>
                </div>
              </div>
              {c.d ? (
                <Portrait d={c.d} live sizes="200px" className="h-full w-[clamp(140px,16vw,210px)]" />
              ) : (
                <span
                  aria-hidden="true"
                  className="w-[clamp(140px,16vw,210px)]"
                  style={{ background: `linear-gradient(160deg, ${c.colour}, transparent 75%)` }}
                />
              )}
            </article>
          ))}
        </div>

        <PointsChart />

        <div className="mt-20 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <h3 className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-sub">Drivers&apos; standings</h3>
            <table className="w-full border-collapse text-left">
              <thead className="sr-only">
                <tr>
                  <th>Position</th>
                  <th>Driver</th>
                  <th>Wins</th>
                  <th>Podiums</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {s.drivers.map((r) => {
                  const d = driver(r.driver_id);
                  const t = team(r.team);
                  return (
                    <tr key={r.driver_id} className="border-t border-rule">
                      <td className="type-data w-10 py-3 text-[13px] text-sub">{r.position}</td>
                      <td className="py-3">
                        <span className="flex items-center gap-3">
                          <i className="h-4 w-1 rounded-sm" style={{ background: t.colour }} />
                          <span className="type-code w-12 text-xl">{d.code}</span>
                          <span className="truncate max-sm:hidden">{d.name}</span>
                        </span>
                      </td>
                      <td className="type-data py-3 text-right text-[13px] text-sub">{r.wins ? `${r.wins} W` : ""}</td>
                      <td className="type-data py-3 text-right text-[13px] text-sub max-sm:hidden">
                        {r.podiums ? `${r.podiums} P` : ""}
                      </td>
                      <td className="type-data py-3 text-right text-lg">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-sub">
              Constructors&apos; standings
            </h3>
            <ol>
              {s.constructors.map((r) => {
                const t = team(r.constructor_id);
                const w = (r.points / Math.max(1, s.constructors[0].points)) * 100;
                return (
                  <li
                    key={r.constructor_id}
                    className="grid grid-cols-[28px_minmax(0,1fr)_64px] items-center gap-3 border-t border-rule py-3"
                    style={{ "--c": t.colour } as CSSProperties}
                  >
                    <span className="type-data text-[13px] text-sub">{r.position}</span>
                    <span className="grid gap-1.5">
                      <span className="text-[15px]">{t.name}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-rule" data-reveal="fade">
                        <i className="bar-fill" style={{ "--w": `${Math.max(1, w)}%` } as CSSProperties} />
                      </span>
                    </span>
                    <span className="type-data text-right text-lg">{r.points}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
