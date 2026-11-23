import { ImageResponse } from "next/og";
import { driver, shortRaceName, team } from "@/lib/data";
import { oneIn, parseCall } from "@/lib/podium";

const size = { width: 1200, height: 630 };

/** The preview card for a shared podium call: /api/card?r=2026-22&p=ver,nor,ant */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const call = parseCall(url.searchParams.get("p"), url.searchParams.get("r"));
  if (!call) return new Response("Not a valid call.", { status: 400 });
  const { race, picks, p, modelP } = call;
  const steps = [
    { id: picks[1], h: 210, n: "2" },
    { id: picks[0], h: 270, n: "1" },
    { id: picks[2], h: 170, n: "3" },
  ];
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0b0c0e", padding: "56px 64px", fontFamily: "sans-serif", color: "#ecedef" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 22, color: "#8a9099", textTransform: "uppercase", letterSpacing: 4 }}>{`My ${shortRaceName(race.race_name)} podium`}</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 900, fontStyle: "italic" }}>
            PIT<span style={{ fontWeight: 300 }}>WALL</span>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
            {steps.map((s) => {
              const d = driver(s.id);
              const c = team(d.team_now).colour;
              return (
                <div key={s.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 46, fontWeight: 800, color: c }}>{d.code}</div>
                  <div style={{ display: "flex", width: 150, height: s.h, background: "#17181c", borderTop: `8px solid ${c}`, justifyContent: "center", paddingTop: 18, fontSize: 60, fontWeight: 900, color: "#3a3d44" }}>
                    {s.n}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10 }}>
            <div style={{ fontSize: 26, color: "#8a9099" }}>The model gives it</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontSize: 40, color: "#c4c8ce", fontStyle: "italic" }}>1 in</span>
              <span style={{ fontSize: 150, fontWeight: 900, letterSpacing: -5, lineHeight: 1 }}>{oneIn(p)}</span>
            </div>
            <div style={{ fontSize: 24, color: "#8a9099" }}>{`Its own pick: 1 in ${oneIn(modelP)} · Can you beat it?`}</div>
          </div>
        </div>
        <div style={{ display: "flex", height: 8, width: "100%", marginTop: 36, background: "linear-gradient(90deg, #8f45ff, #b98cff)", borderRadius: 4 }} />
      </div>
    ),
    { ...size, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
