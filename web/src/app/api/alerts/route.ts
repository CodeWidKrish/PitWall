import { connection, NextResponse } from "next/server";
import { alertsReady, parseSubscription, removeSubscription, saveSubscription } from "@/lib/alerts-server";

/** Are alerts switched on, and the public key to subscribe with. */
export async function GET() {
  await connection();
  return NextResponse.json(
    { enabled: alertsReady(), publicKey: alertsReady() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null },
    { headers: { "cache-control": "no-store" } },
  );
}

async function body(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Subscribe this browser to race alerts. */
export async function POST(req: Request) {
  if (!alertsReady()) return NextResponse.json({ error: "Alerts are not switched on yet." }, { status: 503 });
  const sub = parseSubscription(await body(req));
  if (!sub) return NextResponse.json({ error: "Not a push subscription." }, { status: 400 });
  await saveSubscription(sub);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Unsubscribe this browser. */
export async function DELETE(req: Request) {
  if (!alertsReady()) return NextResponse.json({ ok: true });
  const b = (await body(req)) as { endpoint?: unknown } | null;
  if (!b || typeof b.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
  await removeSubscription(b.endpoint);
  return NextResponse.json({ ok: true });
}
