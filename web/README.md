# PitWall web

The PitWall website: Next.js 16 (App Router), TypeScript in strict mode and Tailwind CSS 4.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Structure

```
src/app/              routes, root layout, global styles and design tokens
src/components/ui/    small reusable pieces (eyebrow label, start lights)
src/components/site/  page sections (header, hero, features, build log, footer)
src/lib/              typed content and helpers
```

Design tokens follow the approved prototype: concrete and carbon grounds, the purple-sector accent, timing colours with meaning, Archivo for display, Instrument Serif italic for the voice and IBM Plex Mono for numbers.

## Deploy

The site deploys on Vercel with **Root Directory** set to `web`.
