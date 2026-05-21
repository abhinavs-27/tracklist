# Listening Report — Mobile Screen + Web Redesign

**Date:** 2026-05-21
**Status:** Approved
**Scope:** Two parallel changes sharing the same visual language — a redesigned web report page and a brand-new mobile screen that fixes the broken "Full report →" navigation from the profile.

---

## Background

The web listening report at `/reports/listening` exists and works but is visually plain. The mobile app has two "Full report →" / "Report" buttons in `ProfileContent.tsx` that call `router.push("/reports/listening")`, but no such screen exists in the Expo Router tree — the navigation silently fails.

---

## Visual Direction

**Charts Magazine** — #1 entry gets an emerald hero panel with album art. Ranks 2+ appear in a grouped card below. A 4-stat strip (total plays, % change, top gainer, new entries) replaces the current inline compare text. Controls are reorganised but unchanged in capability.

---

## Web Redesign

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Plays 342 ↑18%]  [Top gainer: K.Lamar +14]  [New: 7]  [Top dropper: Drake −8]  │
├─────────────────────────────────────────────────────────────┤
│  [Week] [Month] [Year] [Custom]        [Artists] [Albums] [Tracks] [Genres]  [Share] [Save] │
├─────────────────────────────────────────────────────────────┤
│  ████ #1  [art]  This week · Artists                        │
│  ████      Shashwat Sachdev — 40 plays · New entry          │
├─────────────────────────────────────────────────────────────┤
│  2  [art]  Isaiah Rashad   22 plays   ↑ +3                  │
│  3  [art]  Drake           21 plays   ↓ −2                  │
│  4  [art]  Stevie Wonder   19 plays   —                     │
│  5  [art]  Yeat            18 plays   NEW                   │
│  …                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Stat Strip

Four cards in a row, each showing one comparison metric:
- **Total plays** — count + `↑/↓ X%` vs prior period (emerald/red)
- **Top gainer** — name + `+N spots` in emerald
- **New entries** — count of items with `isNew: true`
- **Top dropper** — name + `−N spots` in red

Stat strip only renders when `compare` data is available (same condition as today's compare text). Hidden during loading.

### #1 Hero Row

A full-width card with:
- Left: emerald gradient panel containing `#1` in 28px bold
- Center-left: 56×56 album art with `Image priority`
- Body: entity type + period label in emerald small-caps, name in 18px bold, play count
- Right: movement badge (rank change or "New entry")

### Ranks 2+

All remaining rows grouped inside a single `rounded-2xl` card with dividers. Each row:
- Rank number (18px bold, muted)
- 40×40 album art (`Image`, `sizes="40px"`)
- Name + play count
- Movement badge right-aligned (emerald ↑, red ↓, muted —, italic NEW)

### Controls Row

Single flex row:
- Left cluster: range pills (Week / Month / Year / Custom) — emerald active fill
- Right cluster: entity pills (Artists / Albums / Tracks / Genres) — violet active fill
- Far right: Share + Save buttons (ghost style, same row)

Custom date inputs expand inline below the controls row when "Custom" is selected (unchanged behaviour).

### File Changed

`app/reports/(tabs)/listening/listening-reports-client.tsx` — replace the compare text block and the current pill/button layout with the new structure. No API changes.

---

## Mobile Screen

### Route

`mobile/app/(tabs)/reports/listening.tsx`

This is a stack screen pushed from the profile, not a tab. The Expo Router `(tabs)` segment just means it shares the tab layout shell — it won't appear as a tab icon.

To make the route pushable, add it to `mobile/app/(tabs)/` and register it via `router.push("/(tabs)/reports/listening")` in `ProfileContent.tsx`.

### Screen Structure

```
┌──────────────────────────────────┐
│ ← Listening Report         Share │  ← stack header (or custom View)
├──────────────────────────────────┤
│ [Artists│Albums│Tracks│Genres]  Week ▾ │  ← sticky
├──────────────────────────────────┤
│ [Plays 342 ↑18%│New 7│K.Lamar +14] │  ← 3-col stat card
├──────────────────────────────────┤
│ ████ #1  [art]  Shashwat Sachdev │  ← hero card
│           40 plays · This week   │
├──────────────────────────────────┤
│  2  [art]  Isaiah Rashad  22  ↑+3│  ← grouped list card
│  3  [art]  Drake          21  ↓−2│
│  4  [art]  Stevie Wonder  19  — │
│  …                               │
│  [Load more]                     │
└──────────────────────────────────┘
```

### Entity Segmented Control

`SegmentedControl`-style row (4 equal segments: Artists / Albums / Tracks / Genres). Active segment uses violet background (`#7c3aed`). Stacked horizontally in the sticky header row alongside the range pill.

### Range Pill + Bottom Sheet

A small pill button showing the active range label + ▾ chevron (e.g. "Week ▾"). Tapping it opens a `Modal` (`transparent`, `animationType="slide"`) — the same pattern used by `CommentSheet` and `YearRangeFilter` in the project. A semi-transparent overlay covers the screen; the sheet slides up from the bottom and respects `useSafeAreaInsets`. No new dependencies needed.

The sheet contains:

```
──── [drag handle] ────

Period
  [Week] [Month] [Year] [Custom]    ← horizontal chips, emerald active

↓ When Custom is selected, expands inline:
  ┌─────────────┐      ┌─────────────┐
  │ From        │  →   │ To          │
  │ Apr 1       │      │ Apr 30      │
  └─────────────┘      └─────────────┘
  Each field triggers the native DateTimePicker (mode="date").

  [Apply]  ← enabled only when both dates set, closes sheet + fires fetch
```

Preset chips (Week/Month/Year) close the sheet immediately and fire the fetch. Custom stays open until Apply is tapped.

### Stat Bar

A single `View` with three columns separated by `View` dividers, inside a `border` card:
- **Plays** — total count + `↑/↓ X%`
- **New** — new entries count
- **Top gainer** — truncated name + spots gained

Stat bar only renders when compare data is loaded. Shows a skeleton placeholder during initial load.

### List

`FlatList` with `keyExtractor` on `entityId`. Item structure mirrors web: rank number, `Artwork` component (48×48, `cachePolicy="memory-disk"`, `transition={200}`), name + play count, movement badge.

#1 is rendered as a separate `ListHeaderComponent` hero card above the `FlatList`.

`onEndReached` triggers load-more (same pagination as web, offset-based).

### Data Fetching

New hook `useListeningReport` in `mobile/lib/hooks/useListeningReport.ts`:

```ts
useListeningReport({ range, entityType, startDate?, endDate? })
```

Calls `GET /api/reports?type=<entityType>&range=<range>&limit=50&offset=<n>` (same endpoint as web). Also fetches `GET /api/reports/compare?...` for the stat bar. Both are standard `fetcher<T>()` calls, enabled when `session` is present.

### Share

Nav header right button calls `Share.share()` (React Native built-in) with a text summary: `"My top Artists this week on Tracklist: 1. Shashwat Sachdev (40 plays) …"`. No image generation on mobile (web-only feature).

### Navigation Fix

In `mobile/components/profile/ProfileContent.tsx`, update both `router.push` calls:
```ts
// Before
router.push("/reports/listening" as never)
// After
router.push("/(tabs)/reports/listening" as never)
```

---

## Error & Loading States

Both platforms:
- **Loading**: skeleton rows (animated pulse) while first fetch is in flight
- **Empty**: "No data for this period" copy with a subtle icon
- **Error**: inline error message with a Retry button
- **No compare data**: stat strip/bar is hidden (not an error)

---

## Files Changed / Created

| File | Change |
|------|--------|
| `app/reports/(tabs)/listening/listening-reports-client.tsx` | Redesign — stat strip, hero row, grouped list, controls row |
| `mobile/app/(tabs)/reports/listening.tsx` | New — full mobile screen |
| `mobile/lib/hooks/useListeningReport.ts` | New — data fetching hook |
| `mobile/components/profile/ProfileContent.tsx` | Fix push path |

No API changes. No new migrations. No new dependencies — bottom sheet implemented with React Native `Modal` following the existing `CommentSheet` pattern.
