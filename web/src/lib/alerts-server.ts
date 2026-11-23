/**
 * Race alerts on the server: subscriptions live in a private Vercel Blob store, one file
 * per browser, named by a hash of its push endpoint. Nothing else about the visitor is kept.
 */
import { createHash } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import webpush, { type PushSubscription } from "web-push";
import { type NextRace, pct, shortRaceName, driver, site } from "@/lib/data";

const token = () => process.env.PUSH_BLOB_READ_WRITE_TOKEN;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function alertsReady(): boolean {
  return Boolean(token() && PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

const idOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

/** A push subscription as the browser sends it; anything else is rejected. */
export function parseSubscription(body: unknown): PushSubscription | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof b.endpoint !== "string" || b.endpoint.length > 1024) return null;
  let url: URL;
  try {
    url = new URL(b.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const { p256dh, auth } = b.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: b.endpoint, keys: { p256dh, auth } };
}

export async function saveSubscription(sub: PushSubscription): Promise<void> {
  await put(`subs/${idOf(sub.endpoint)}.json`, JSON.stringify(sub), {
    access: "private",
    token: token(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await del(`subs/${idOf(endpoint)}.json`, { token: token() });
}

async function readJson<T>(pathname: string): Promise<T | null> {
  const res = await get(pathname, { access: "private", token: token(), useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text()) as T;
}

async function allSubscriptions(): Promise<PushSubscription[]> {
  const out: PushSubscription[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "subs/", token: token(), cursor, limit: 1000 });
    const subs = await Promise.all(page.blobs.map((b) => readJson<PushSubscription>(b.pathname)));
    out.push(...subs.filter((s): s is PushSubscription => s !== null));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export interface Alert {
  key: string;
  title: string;
  body: string;
  url: string;
}

const top3 = (race: NextRace) =>
  race.odds
    .slice(0, 3)
    .map((o) => `${driver(o.driver_id).code} ${pct(o.p_win, 0)}`)
    .join(" · ");

/**
 * What to send now, if anything: the odds in race week, then again once the grid is set.
 * Each is sent once per race (`key`), and never after lights out.
 */
export function dueAlert(now = Date.now(), race = site.next_race): Alert | null {
  if (!race?.start_utc) return null;
  const hours = (Date.parse(race.start_utc) - now) / 3_600_000;
  if (hours <= 0) return null;
  const name = shortRaceName(race.race_name);
  const base = `${race.season}-${String(race.round).padStart(2, "0")}`;
  if (race.stage === "post_quali") {
    return {
      key: `${base}-grid`,
      title: `Grid set in ${name}`,
      body: `Pole: ${driver(race.pole).name}. Odds re-run: ${top3(race)}.`,
      url: "/#odds",
    };
  }
  if (hours <= 72) {
    const when = new Date(race.start_utc).toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
    return {
      key: `${base}-week`,
      title: `${name} odds are in`,
      body: `${top3(race)}. Lights out ${when}. Make your call before then.`,
      url: "/#odds",
    };
  }
  return null;
}

/** Send the due alert to every subscriber, once. Dead subscriptions are removed. */
export async function sendDue(opts: { dry?: boolean; now?: number } = {}) {
  const alert = dueAlert(opts.now);
  if (!alert) return { sent: 0, reason: "nothing due" as const };
  const marker = `sent/${alert.key}.json`;
  if (await readJson(marker)) return { sent: 0, reason: "already sent" as const, alert };
  const subs = await allSubscriptions();
  if (opts.dry) return { sent: 0, reason: "dry run" as const, alert, subscribers: subs.length };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://pitwallgp.vercel.app",
    PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  const payload = JSON.stringify({ title: alert.title, body: alert.body, url: alert.url, tag: alert.key });
  let sent = 0,
    removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, payload, { TTL: 6 * 3600, urgency: "normal" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await removeSubscription(s.endpoint);
          removed++;
        }
      }
    }),
  );
  await put(marker, JSON.stringify({ at: new Date().toISOString(), sent }), {
    access: "private",
    token: token(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return { sent, removed, reason: "sent" as const, alert };
}
