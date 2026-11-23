import { CarStudio } from "@/components/site/car-studio";
import { DriverPicker } from "@/components/site/driver-picker";
import { Forecast } from "@/components/site/forecast";
import { HeadToHead } from "@/components/site/head-to-head";
import { Hero } from "@/components/site/hero";
import { PodiumGame } from "@/components/site/podium-game";
import { LiveRecord } from "@/components/site/live-record";
import { Record } from "@/components/site/record";
import { Season } from "@/components/site/season";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Watch } from "@/components/site/watch";
import { WeekendOdds } from "@/components/site/weekend-odds";
import { WhatIf } from "@/components/site/what-if";
import { D, SectionHead, V } from "@/components/ui/reveal";
import { currentGrid, shortRaceName, site } from "@/lib/data";

export default function Home() {
  const race = site.next_race;
  const grid = currentGrid();
  const teams = new Set(grid.map((d) => d.team_now)).size;
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />

        <section id="drivers" className="theme-night section" aria-labelledby="drivers-h">
          <div className="wrap">
            <SectionHead
              id="drivers-h"
              tag={`The ${site.season.season} grid · ${grid.length} drivers, ${teams} teams`}
              lines={[
                <span key="a">
                  <D>Pick</D> <V>who you</V>
                </span>,
                <D key="b">ride with</D>,
              ]}
              lede="The whole site follows your driver: their team colour, their line on every chart, their row in every table. Your pick stays in this browser."
            />
            <DriverPicker />
          </div>
        </section>

        <section id="car" className="theme-night section !pt-0" aria-labelledby="car-h">
          <div className="wrap">
            <SectionHead
              id="car-h"
              tag="The car · turntable"
              lines={[
                <span key="a">
                  <D>Built</D> <V>for</V>
                </span>,
                <D key="b">355 km/h</D>,
              ]}
              lede="Walk around a modern F1 car. Paint it in any team's colours, switch tyres and lighting, and tap the pins to see what each part does."
            />
            <CarStudio />
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              {[
                ["~1,000 hp", "From a 1.6-litre V6 turbo hybrid"],
                ["800 kg", "Minimum weight, with the driver"],
                ["355 km/h", "Top speed in our race physics"],
                ["6.3 g", "Braking from 300 km/h, from downforce"],
              ].map(([v, k]) => (
                <div key={k} className="grid gap-1.5 border-t border-rule pt-4">
                  <dt className="order-2 text-sm text-sub">{k}</dt>
                  <dd className="type-display order-1 text-[clamp(30px,3.6vw,46px)] leading-none">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {race ? (
          <section id="odds" className="theme-day section" aria-labelledby="odds-h">
            <div className="wrap">
              <SectionHead
                id="odds-h"
                tag={`The odds · Round ${race.round} · ${shortRaceName(race.race_name)}`}
                lines={[
                  <span key="a">
                    <D>{race.odds.length}</D> <V>drivers,</V>
                  </span>,
                  <span key="b">
                    <D>one</D> <V>Sunday</V>
                  </span>,
                ]}
                lede={`Win and podium chances at ${race.circuit_name}, ${
                  race.stage === "post_quali" ? "re-run now the grid is set" : "before qualifying"
                }${race.sprint ? ", for the sprint and the Grand Prix" : ""}. Open any driver to see the numbers the model read.`}
              />
              <WeekendOdds race={race} />
            </div>
          </section>
        ) : null}

        {race ? (
          <section id="game" className="theme-night section" aria-labelledby="game-h">
            <div className="wrap">
              <SectionHead
                id="game-h"
                tag={`Your call · ${shortRaceName(race.race_name)}`}
                lines={[
                  <span key="a">
                    <V>Beat</V> <D>the</D>
                  </span>,
                  <D key="b">model</D>,
                ]}
                lede="Drag three drivers onto the podium, or tap to fill the next step. Lock it in and see how likely the model thinks your call is."
              />
              <PodiumGame race={race} />
            </div>
          </section>
        ) : null}

        <Season />

        <section id="h2h" className="theme-day section !pt-0" aria-labelledby="h2h-h">
          <div className="wrap">
            <SectionHead
              id="h2h-h"
              tag={`Head to head · ${site.season.season} season`}
              lines={[
                <span key="a">
                  <D>Settle</D> <V>the</V>
                </span>,
                <D key="b">argument</D>,
              ]}
              lede="Put any two drivers side by side. It starts with your driver against their teammate."
            />
            <HeadToHead />
          </div>
        </section>

        <section id="watch" className="theme-night section" aria-labelledby="watch-h">
          <div className="wrap">
            <SectionHead
              id="watch-h"
              tag="Watch · official race highlights"
              lines={[
                <span key="a">
                  <V>Relive</V> <D>the</D>
                </span>,
                <D key="b">season</D>,
              ]}
              lede="The races behind the numbers. Pick one, then check how the model's call held up in the record below."
            />
          </div>
          <Watch />
        </section>

        <Forecast />

        <section id="whatif" className="theme-day section" aria-labelledby="whatif-h">
          <div className="wrap">
            <SectionHead
              id="whatif-h"
              tag={`What if · ${site.forecast?.season ?? ""} season`}
              lines={[
                <span key="a">
                  <D>Break</D> <V>the</V>
                </span>,
                <D key="b">season</D>,
              ]}
              lede="Change one thing about next season and re-run 10,000 of them, right here in your browser."
            />
            <WhatIf />
          </div>
        </section>

        <LiveRecord />

        <Record />
      </main>
      <SiteFooter />
    </>
  );
}
