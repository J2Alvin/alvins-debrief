# Alvin's Debrief

AI-curated daily news site. A cron job pulls RSS feeds, Gemini filters them to 15–20 top stories, and Next.js renders the result from a static JSON file.

## Stack
- Next.js 14 (App Router), React 18, TypeScript, Tailwind 3
- `@google/generative-ai` (Gemini) for curation, `rss-parser` for feeds
- No database. `data/news.json` is the single source of truth.

## Commands
- `npm run dev` / `npm run build` / `npm start`
- `npm run cron` runs `scripts/run-cron.ts` (needs `GEMINI_API_KEY` in env)

## Layout
- `app/page.tsx`: server component, reads `data/news.json` via `fs` at render time
- `app/layout.tsx`, `app/globals.css`: shell and global styles; `layout.tsx` also loads Google Analytics (GA4 ID `G-D6MHKET13E`) via `next/script`
- `app/icon.svg`: site favicon (Next.js auto-detects it; replace the file to change it)
- `config/feeds.ts`: RSS feed URLs (`FEEDS` array)
- `scripts/run-cron.ts`: fetch feeds, prompt Gemini, write `data/news.json`
- `.github/workflows/cron.yml`: runs the cron every 6 hours and auto-commits `data/news.json`

## Data contract (`data/news.json`)
- Top level: `lastUpdated`, `ticker` (5 headlines), `articles` (15–20)
- Article: `headline`, `brief`, `category`, `sourceUrl`, `dateLocation`, `imageUrl`
- Categories: technology, finance, politics, business, sports, health, world, general (max 2 stories per category)
- If you change this shape, update both `scripts/run-cron.ts` (prompt and output) and `app/page.tsx` (rendering)

## Conventions
- Keep the editorial look: Tailwind theme colors `background`, `foreground`, `muted`, `accent` (#CC0000); fonts serif (Playfair Display), body (Lora), sans (Inter), mono (JetBrains Mono)
- Images come from the `UNSPLASH_FALLBACKS` map in the cron script, keyed by category
- Header bar under the title shows a single centered line, "LAST REFRESHED TIME: <lastUpdated in IST>". Keep it to that one line.
- Prefer server components; add `"use client"` only when needed

## Do not
- Hand-edit `data/news.json`. The bot overwrites it every 6 hours.
- Commit secrets. `GEMINI_API_KEY` lives in GitHub Actions secrets only.
- Change word limits in the Gemini prompt (headline ≤10 words, brief ≤70) without checking the layout.
