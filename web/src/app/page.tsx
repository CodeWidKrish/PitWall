import { DriverPicker } from "@/components/site/driver-picker";
import { Forecast } from "@/components/site/forecast";
import { HeadToHead } from "@/components/site/head-to-head";
import { Hero } from "@/components/site/hero";
import { RaceOdds } from "@/components/site/race-odds";
import { Record } from "@/components/site/record";
import { Season } from "@/components/site/season";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Watch } from "@/components/site/watch";
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
                lede={`Win and podium chances at ${race.circuit_name}, before qualifying. Open any driver to see the numbers the model read.`}
              />
              <RaceOdds race={race} />
            </div>
          </section>
        ) : null}

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

        <Forecast />
        <Record />
      </main>
      <SiteFooter />
    </>
  );
}
