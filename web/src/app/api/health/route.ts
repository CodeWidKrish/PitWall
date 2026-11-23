import { connection, NextResponse } from "next/server";
import { alertsReady } from "@/lib/alerts-server";
import { site } from "@/lib/data";
import { ledger } from "@/lib/ledger";

/**
 * Is the site healthy and its data fresh? Checked hourly by the `uptime` workflow.
 * Stale means a race finished more than two days ago and the site still shows it as next.
 */
export async function GET() {
  await connection();
  const now = Date.now();
  const race = site.next_race;
  const start = race?.start_utc ? Date.parse(race.start_utc) : null;
  const overdueHours = start ? (now - start) / 3_600_000 : null;
  const stale = overdueHours !== null && overdueHours > 48;
  const body = {
    ok: !stale,
    reason: stale ? `${race?.race_name} started ${Math.round(overdueHours ?? 0)} hours ago and has not been scored yet` : null,
    built_at: site.built_at,
    data_age_hours: Math.round((now - Date.parse(site.built_at)) / 360_000) / 10,
    data_through: site.data_through,
    next_race: race ? { name: race.race_name, start_utc: race.start_utc, stage: race.stage ?? "pre_quali" } : null,
    ledger: {
      calls: ledger.calls.length,
      scored: ledger.calls.filter((c) => c.result).length,
      waiting: ledger.calls.filter((c) => !c.result).map((c) => c.race_name),
    },
    features: { chat: Boolean(process.env.GROQ_API_KEY), alerts: alertsReady() },
  };
  return NextResponse.json(body, { status: stale ? 503 : 200, headers: { "cache-control": "no-store" } });
}
