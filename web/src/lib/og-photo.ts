import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** A file from /public as a data URL for share images: from disk, or fetched from the live site. */
export async function publicDataUrl(path: string): Promise<string | null> {
  const ext = path.toLowerCase().endsWith(".png") ? "png" : path.toLowerCase().endsWith(".webp") ? "webp" : "jpeg";
  try {
    const buf = await readFile(join(process.cwd(), "public", path));
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  } catch {
    const res = await fetch(`https://pitwallgp.vercel.app/${path}`).catch(() => null);
    if (!res?.ok) return null;
    return `data:${res.headers.get("content-type") ?? `image/${ext}`};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  }
}
