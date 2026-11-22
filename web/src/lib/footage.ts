/**
 * Official race highlights, played through YouTube's embed (youtube-nocookie.com)
 * from the FORMULA 1 channel. Nothing is copied or re-hosted: the videos stay on
 * YouTube and play under its terms. Each id was checked with YouTube's oEmbed
 * endpoint to confirm the uploader is the official FORMULA 1 channel.
 */
export interface Highlight {
  id: string;
  season: number;
  circuitId: string;
  race: string;
}

export const HIGHLIGHTS_PLAYLIST = "PLfoNZDHitwjU1j8PiNg17QGDN37d07Rex";

export const HIGHLIGHTS: Highlight[] = [
  { id: "Vyk_6bNm7lo", season: 2026, circuitId: "vegas", race: "Las Vegas Grand Prix" },
  { id: "lkb5kqDJYXk", season: 2026, circuitId: "interlagos", race: "São Paulo Grand Prix" },
  { id: "U-V7IfBwN1I", season: 2026, circuitId: "sepang", race: "Bahrain Grand Prix in Malaysia" },
  { id: "I9oahfzac0I", season: 2026, circuitId: "baku", race: "Azerbaijan Grand Prix" },
  { id: "3OMLs3yI-KE", season: 2026, circuitId: "zandvoort", race: "Dutch Grand Prix" },
  { id: "_JeaXt_3Mhc", season: 2026, circuitId: "hungaroring", race: "Hungarian Grand Prix" },
  { id: "QrRh2vOJQbw", season: 2026, circuitId: "villeneuve", race: "Canadian Grand Prix" },
  { id: "5gYys4GL7S0", season: 2026, circuitId: "miami", race: "Miami Grand Prix" },
];

export function highlightFor(circuitId: string, season: number): Highlight | undefined {
  return HIGHLIGHTS.find((h) => h.circuitId === circuitId && h.season === season);
}

export function poster(id: string): string {
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}

export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export function playlistUrl(): string {
  return `https://www.youtube.com/playlist?list=${HIGHLIGHTS_PLAYLIST}`;
}
