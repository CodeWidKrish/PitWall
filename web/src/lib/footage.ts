/**
 * Footage.
 *
 * Clips: real F1 cars filmed by fans, from Wikimedia Commons under CC BY-SA 4.0.
 * Trimmed and re-encoded for the web (the changes the licence asks us to note);
 * hosted with the site in /public/footage, original trackside sound included.
 *
 * Highlights: FORMULA 1's official race highlights. F1 blocks these from playing
 * inside other websites (YouTube error 150), so they open on YouTube instead.
 */
export interface Clip {
  slug: string;
  title: string;
  place: string;
  year: number;
  note: string;
  author: string;
  licence: string;
  licenceUrl: string;
  source: string;
}

export const CLIPS: Clip[] = [
  {
    slug: "istanbul-wet-pass",
    title: "Wet running, Turns 4 and 5",
    place: "Istanbul Park, Turkish GP",
    year: 2021,
    note: "Cars on a drying line in the rain, filmed from the hillside.",
    author: "SAİT71",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:Formula_1_Turkish_GP_2021_-_2.ogg",
  },
  {
    slug: "sochi-grid",
    title: "Away for the formation lap",
    place: "Sochi Autodrom, Russian GP",
    year: 2021,
    note: "The grid pulls away for the warm-up lap, from the main grandstand.",
    author: "rubin16",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:2021_Russian_Grand_Prix_-_start_for_warm-up.webm",
  },
  {
    slug: "red-bull-pit-stop",
    title: "Pit stop practice",
    place: "Autódromo Hermanos Rodríguez, Mexico",
    year: 2015,
    note: "A full crew rehearsing stops in the pit lane before the race weekend.",
    author: "ProtoplasmaKid",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:Red_Bull_Racing_Pit_Stop_Practice.webm",
  },
  {
    slug: "istanbul-wet-hill",
    title: "Over the crest in the rain",
    place: "Istanbul Park, Turkish GP",
    year: 2021,
    note: "Spray and standing water through the downhill sweep.",
    author: "SAİT71",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:Formula_1_Turkish_GP_2021.ogg",
  },
];

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

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function playlistUrl(): string {
  return `https://www.youtube.com/playlist?list=${HIGHLIGHTS_PLAYLIST}`;
}
