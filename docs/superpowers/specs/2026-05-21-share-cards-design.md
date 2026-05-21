# Share Cards Redesign

**Date:** 2026-05-21
**Status:** Approved — ready for implementation planning

---

## Problem

Two compounding issues prevent viral sharing:

1. **Image generation is broken in production.** The font loader fetches Inter from `fonts.gstatic.com` at runtime on every cold start. Serverless cold starts on Vercel frequently timeout or fail this network request, causing the entire PNG generation to fail silently.

2. **The card design and share flow are not compelling enough to drive organic posting.** The current card is too data-dense, the colors are static (same for everyone), and the share modal has misleading buttons (Instagram does a download, not an Instagram post).

---

## Goals

- Fix image generation so it reliably produces a PNG every time
- Redesign the card to be genuinely beautiful and personalized per-user
- Redesign the share flow to be honest, modern, and match platform norms
- Make the weekly chart card viral-ready: something people actually want to post

---

## Non-Goals

- Taste identity share card (separate project — needs copy/framing work first)
- Mobile native share cards (web only for this spec)
- Instagram API integration (requires restricted app approval)
- Video / animated cards

---

## Architecture

### 1. Fix: Bundle Fonts as Static Assets

**Root cause:** `lib/charts/chart-share-image-fonts.ts` fetches Inter TTF from `fonts.gstatic.com` on every request with a 24h cache. Cold starts have no cache and the external network call fails or times out.

**Fix:** Download Inter TTF files and serve them from the project's `public/fonts/` directory. Load via the deployment's own origin URL instead of Google's CDN.

```
public/
  fonts/
    inter-regular.ttf   (Inter v20, 400 weight, ~350KB)
    inter-bold.ttf      (Inter v20, 700 weight, ~350KB)
```

In `chart-share-image-fonts.ts`, replace the Google Fonts fetch with:

```typescript
const base = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : `http://localhost:${process.env.PORT ?? 3000}`;

const [r400, r700] = await Promise.all([
  fetch(`${base}/fonts/inter-regular.ttf`, { next: { revalidate: 86400 } }),
  fetch(`${base}/fonts/inter-bold.ttf`, { next: { revalidate: 86400 } }),
]);
```

This works because:
- Vercel serves `public/` assets at the deployment URL
- The serverless function fetches from its own origin — always reachable, no cold-start penalty after first request
- `VERCEL_URL` is set automatically on all Vercel deployments

**Fallback:** If the self-hosted font fetch also fails, `loadChartShareImageFonts` already returns `[]` and Satori falls back to system fonts. Card still renders, just with fallback typography.

---

### 2. Card Redesign: D-Style with Dynamic Color

#### Visual design

**Layout (V2 + D):**
- 1080×1350px (4:5 — Instagram post and Stories-compatible)
- Header bar: `Tracklist · Week of [date] · @username`
- Big centered #1 album art (~42% of card width, ~22% of card height)
- `YOUR #1 THIS WEEK` label + album name + artist + play count
- Thin divider
- `Also in rotation` label + 4 album thumbnails in a single horizontal row (1×4 grid)
- 3 stat pills at the bottom: plays / top genre / streak

**Background (D-style — blurred album art):**

Four layered composites, bottom to top:

| Layer | Description |
|-------|-------------|
| 1 — Base | Blurred, scaled-up version of #1 album art. Scale 130%, blur 40px. The entire card atmosphere comes from the music. |
| 2 — Dark overlay | `rgba(4,2,2,0.72)` semi-transparent dark. Ensures text is always readable. |
| 3 — Edge vignette | Radial gradient: transparent center → `rgba(0,0,0,0.55)` edges. Adds depth. |
| 4 — Film grain | SVG `feTurbulence` noise at opacity 0.055. Tactile, premium feel. |

**Dynamic accent color:**
The `YOUR #1 THIS WEEK` label and `Tracklist` wordmark use an accent color extracted from the album art. This makes every card look unique — warm orange for rock, cool blue for electronic, deep purple for indie. Implementation: server-side color extraction from the album's `image_url` (see Section 3).

**Album thumbnails:** Real artwork from the user's #2–5 entries, same as the #1 treatment.

#### Satori implementation notes

- All inline styles (Satori requirement — no Tailwind, no CSS classes)
- `next/og` `ImageResponse` at 1080×1350
- Background layers 2–4 are pure CSS — no external images needed beyond the album arts
- Layer 1 (blurred art) uses the album `image_url` fetched and passed as a data URI or remote URL (Satori supports remote image URLs with `img` tags)
- Font: Inter 400 + 700 from `public/fonts/` (see Section 1)

**New file:** `lib/charts/chart-share-image-template-v2.tsx` — replaces the current template. Keep old template for community chart endpoints until those are separately updated.

---

### 3. Color Extraction

Server-side color extraction from the #1 album's artwork URL.

**Library:** `fast-average-color-node` — lightweight (~15KB), no native dependencies (unlike `sharp`), works in Vercel serverless.

```typescript
// lib/charts/extract-album-color.ts
import { FastAverageColor } from "fast-average-color-node";

export type AlbumPalette = {
  /** CSS hex — used for the accent label color */
  accent: string;
  /** CSS hex — used as a subtle tint in the background gradient */
  tint: string;
};

export async function extractAlbumPalette(imageUrl: string): Promise<AlbumPalette> {
  // fallback for when extraction fails
  const FALLBACK: AlbumPalette = { accent: "#f97316", tint: "#7c2d12" };
  try {
    const fac = new FastAverageColor();
    const color = await fac.getColorAsync(imageUrl);
    // Shift toward a usable accent: boost saturation, lighten slightly
    return {
      accent: lighten(color.hex, 0.2),
      tint: darken(color.hex, 0.3),
    };
  } catch {
    return FALLBACK;
  }
}
```

`lighten` and `darken` are inline HSL helpers in the same file: parse the hex to HSL, adjust the L channel, convert back. No extra dependency needed.

The extracted palette is passed to `ChartShareImageTemplateV2` as props. The #1 album's `imageUrl` is already fetched in the route — color extraction runs in the same `Promise.all` as the font loading.

---

### 4. Share Modal Redesign

**File:** `components/charts/chart-share-modal.tsx` — full replacement.

#### Layout

Bottom sheet on mobile (existing `rounded-t-3xl` pattern), centered dialog on desktop (existing `sm:rounded-3xl` pattern). No structural change.

#### Card preview thumbnail

A small rendered preview of the PNG appears at the top of the modal before the user takes any action. Implementation:

```tsx
<img
  src={getChartShareImageApiUrl({ chartType, weekStart, communityId })}
  alt="Your chart card"
  className="mx-auto w-full max-w-[200px] rounded-xl"
  crossOrigin="use-credentials"  // auth cookie needed for the endpoint
/>
```

The image is loaded by the browser when the modal opens. A skeleton shows while loading. If the image fails to load (generation error), it falls back to the existing text summary.

#### Share actions — platform-aware

**Mobile (when `navigator.share` is available + `navigator.canShare({ files })`):**

Primary action: single large "Share image" button that calls Web Share API with the PNG as a `File` object. The OS native share sheet appears — user picks Instagram, WhatsApp, iMessage, X, or anything else. Instagram receives the image directly and opens to Stories/post composer.

Secondary row (3 small buttons): Copy link · Save PNG · Post to X (text intent)

**Desktop (no Web Share API or no file sharing):**

Primary action: "Download image" button — saves the PNG with a proper filename.

Secondary row: Copy link · Post to X

Instagram note: A small info block explains "For Instagram: download the image, then upload from your phone."

#### Action logic

```typescript
const isMobile = typeof navigator !== "undefined" && /mobile|android|iphone|ipad/i.test(navigator.userAgent);
const canShareFiles = typeof navigator !== "undefined" && 
  !!navigator.canShare?.({ files: [new File([], "test.png", { type: "image/png" })] });

// Primary action
const primaryAction = (isMobile && canShareFiles) ? "native-share" : "download";
```

**`native-share` flow:**
1. Fetch PNG from `/api/charts/share-image`
2. Wrap in `File` object
3. `navigator.share({ files: [file], title: "My weekly chart on Tracklist" })`
4. OS handles the rest

**`download` flow:**
1. Fetch PNG from `/api/charts/share-image`
2. Create object URL → `<a download>` → click → revoke

**X share:** `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` — opens in new tab. Text includes #1 name, play count, and `tracklist.lol/@username` URL. No image attachment (not possible via intent URL).

**Loading states:** While the PNG is fetching, primary button shows a spinner and is disabled. Image preview shows skeleton. Toast on error.

---

### 5. Files Changed

**New files:**
- `public/fonts/inter-regular.ttf` — Inter v20 400 weight (~350KB, downloaded from fonts.gstatic.com at setup time)
- `public/fonts/inter-bold.ttf` — Inter v20 700 weight (~350KB)
- `lib/charts/extract-album-color.ts` — color extraction + HSL helpers
- `lib/charts/chart-share-image-template-v2.tsx` — new Satori template
- `package.json` — add `fast-average-color-node` dependency

**Modified files:**
- `lib/charts/chart-share-image-fonts.ts` — self-hosted font loading
- `lib/charts/generate-chart-share-image.tsx` — use V2 template + color extraction
- `app/api/charts/share-image/route.tsx` — pass palette to generator
- `components/charts/chart-share-modal.tsx` — full redesign
- `next.config.ts` — ensure `public/fonts/` is served (no change needed, Next.js serves public/ automatically)

**Unchanged:**
- `app/api/communities/[id]/charts/share-image/route.tsx` — community charts use old template until separately updated
- `app/api/reports/share-image/route.tsx` — report cards separate project

---

## Testing

- Unit: `extractAlbumPalette` — valid image URL returns a non-default palette; network failure returns fallback
- Integration: `GET /api/charts/share-image?type=tracks` returns `Content-Type: image/png` with status 200
- Manual: confirm PNG renders correctly on Vercel preview deploy (not just local dev)
- Manual: confirm Web Share API works on iOS Safari — native share sheet appears with image file
- Manual: confirm download works on Chrome desktop — file saves with correct filename
- Manual: `VERCEL_URL` font loading — check font renders (not fallback system font) in generated PNG
