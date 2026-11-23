import type { MetadataRoute } from "next";

/** Lets PitWall be added to a phone's home screen, which iPhones need for race alerts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PitWall: F1 race and title forecasts",
    short_name: "PitWall",
    description: "Win odds for every driver before every Grand Prix, title odds from 10,000 seasons, and a public record of every call.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
