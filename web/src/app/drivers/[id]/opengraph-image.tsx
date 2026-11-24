import { ImageResponse } from "next/og";
import { pct, shortRaceName, site } from "@/lib/data";
import { publicDataUrl } from "@/lib/og-photo";
import { profile, profileIds } from "@/lib/profile";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Driver card from PitWall";

export function generateStaticParams() {
  return profileIds().map((id) => ({ id }));
}

/** The preview card when a driver page is shared: photo, name, next-race odds, title odds. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = profile(id);
  if (!p) return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#0b0c0e" }} />, size);
  const { d, t, race, odds, standing } = p;
  const photo = d.photo ? await publicDataUrl(`drivers/${d.photo}`) : null;
  const stat = (v: string, k: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 64, fontWeight: 800, color: "#ecedef", letterSpacing: -2 }}>{v}</div>
      <div style={{ fontSize: 18, color: "#8a9099", textTransform: "uppercase", letterSpacing: 3 }}>{k}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0b0c0e", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 430, height: "100%", position: "relative", background: "#15171a" }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img
            <img src={photo} alt="" width={430} height={630} style={{ objectFit: "cover", width: 430, height: 630 }} />
          ) : null}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, background: t.colour, display: "flex" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 22, color: "#8a9099", textTransform: "uppercase", letterSpacing: 4 }}>
              {`${t.name}${d.number ? ` · #${d.number}` : ""}`}
            </div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 900, fontStyle: "italic", color: "#ecedef" }}>
              PIT<span style={{ fontWeight: 300 }}>WALL</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, color: "#c4c8ce", fontStyle: "italic" }}>{d.first_name || d.name.split(" ")[0]}</div>
            <div style={{ fontSize: 104, fontWeight: 900, color: t.colour, lineHeight: 0.9, letterSpacing: -3, textTransform: "uppercase" }}>
              {d.last_name || d.name}
            </div>
          </div>
          <div style={{ display: "flex", gap: 56 }}>
            {odds && race ? stat(pct(odds.p_win), `Win ${shortRaceName(race.race_name)}`) : null}
            {standing ? stat(`P${standing.position}`, `${site.season.season} · ${standing.points} pts`) : null}
            {p.title ? stat(pct(p.title.p_title), `${site.forecast?.season} title`) : null}
          </div>
          <div style={{ display: "flex", height: 8, width: "100%", background: "linear-gradient(90deg, #8f45ff, #b98cff)", borderRadius: 4 }} />
        </div>
      </div>
    ),
    size,
  );
}
