import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { alertsReady, sendDue } from "@/lib/alerts-server";

/**
 * Called on a schedule by the `alerts` GitHub Action. Sends the race-week or grid-set alert
 * once per race. `?dry=1` shows what would be sent without sending it.
 */
export async function POST(req: Request) {
  const secret = process.env.ALERTS_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok =
    secret.length >= 32 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  if (!alertsReady()) return NextResponse.json({ error: "Alerts are not switched on yet." }, { status: 503 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  return NextResponse.json(await sendDue({ dry }));
}
