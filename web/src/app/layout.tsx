import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import { FollowProvider } from "@/components/follow";
import { Chrome } from "@/components/motion/chrome";
import { Toaster } from "@/components/ui/toaster";
import { preconnect } from "react-dom";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PitWall · F1 race and title forecasts",
    template: "%s · PitWall",
  },
  description:
    "PitWall predicts every Formula 1 race winner and both championships, drivers and constructors, publishes its odds before lights out and scores itself in public.",
  applicationName: "PitWall",
  authors: [{ name: "Krish Hingu" }],
  openGraph: {
    title: "PitWall · F1 race and title forecasts",
    description:
      "Win odds for every driver, published before every race and scored after it.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

const MODEL_URL = process.env.NEXT_PUBLIC_CAR_MODEL_URL;

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Open the connection to the 3D car's host early so the model arrives sooner.
  if (MODEL_URL?.startsWith("http")) preconnect(new URL(MODEL_URL).origin, { crossOrigin: "anonymous" });
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSerif.variable} ${plexMono.variable} h-full antialiased`}
      // Browser extensions often add attributes to <html> before React loads.
      // This only ignores attribute differences on this one element.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <noscript>
          <style>{`.reveal-line > span, [data-reveal="fade"], .bar-fill { transform: none !important; opacity: 1 !important; } .intro { display: none !important; }`}</style>
        </noscript>
        <FollowProvider>
          <a
            href="#main"
            className="fixed left-4 top-4 z-[300] -translate-y-24 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-white focus:translate-y-0"
          >
            Skip to content
          </a>
          <Chrome />
          {children}
          <Toaster />
        </FollowProvider>
      </body>
    </html>
  );
}
