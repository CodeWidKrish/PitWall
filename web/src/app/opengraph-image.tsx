import { ImageResponse } from "next/og";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";
import { publicDataUrl } from "@/lib/og-photo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PitWall: who wins the next Grand Prix? The model's favourites and their win chances";

/**
 * The preview card for the site itself: the next race, the model's top three with
 * their win chances, and the favourite's photo. Rebuilt with every data update.
 */
export default async function Image() {
  const race = site.next_race;
  const top = race?.odds.slice(0, 3) ?? [];
  const fav = top[0] ? driver(top[0].driver_id) : null;
  const photo = fav?.photo ? await publicDataUrl(`drivers/${fav.photo}`) : null;
  const best = top[0]?.p_win ?? 1;
  const name = race ? shortRaceName(race.race_name) : "the next race";

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0b0c0e", fontFamily: "sans-serif", color: "#ecedef" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 0 56px 64px", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 900, fontStyle: "italic" }}>
              PIT<span style={{ fontWeight: 300 }}>WALL</span>
            </div>
            <div style={{ fontSize: 20, color: "#8a9099", textTransform: "uppercase", letterSpacing: 4 }}>F1 race and title forecasts</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 22, color: "#8a9099", textTransform: "uppercase", letterSpacing: 4 }}>
              {race ? `Round ${race.round} · ${race.locality}` : "Next race"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <span style={{ fontSize: 84, fontStyle: "italic", color: "#ecedef" }}>Who wins</span>
              <span style={{ fontSize: 96, fontWeight: 900, color: "#8f45ff", letterSpacing: -3, textTransform: "uppercase" }}>{`${name}?`}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 600 }}>
            {top.map((o) => {
              const d = driver(o.driver_id);
              const c = team(o.team).colour;
              return (
                <div key={o.driver_id} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ width: 80, fontSize: 34, fontWeight: 800 }}>{d.code}</div>
                  <div style={{ display: "flex", flex: 1, height: 14, borderRadius: 7, background: "#1d1e23" }}>
                    <div style={{ width: `${(o.p_win / best) * 100}%`, height: 14, borderRadius: 7, background: c }} />
                  </div>
                  <div style={{ width: 120, textAlign: "right", fontSize: 34, fontWeight: 700 }}>{pct(o.p_win)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 380, height: "100%", background: "#15171a" }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img
            <img src={photo} alt="" width={380} height={630} style={{ objectFit: "cover", width: 380, height: 630 }} />
          ) : null}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, display: "flex", background: fav ? team(fav.team_now).colour : "#8f45ff" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 200,
              display: "flex",
              alignItems: "flex-end",
              padding: "0 28px 30px",
              background: "linear-gradient(0deg, rgba(11,12,14,0.92), rgba(11,12,14,0))",
              fontSize: 24,
              color: "#ecedef",
            }}
          >
            {fav && top[0] ? `Favourite: ${fav.name}, ${pct(top[0].p_win)}` : ""}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
