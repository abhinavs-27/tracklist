# Profile Identity & Sharing

**Date:** 2026-05-21
**Status:** Approved — ready for implementation planning

---

## Problem

The listening style system assigns one label from a single scoring competition where styles fight for the highest score. This causes:
1. Heavy clustering — every user with <22 logs gets "Still building," which is nearly all new users
2. Two styles require Spotify popularity data and silently never fire for Last.fm users
3. The labels themselves ("Mainstream," "Mainstay," "Consistent") don't feel like identities worth sharing
4. Profiles have no shareable image — no viral surface exists for music identity

---

## Goals

- Replace the single-winner scoring system with 4 orthogonal axes
- Each user gets a primary label and a secondary badge from their strongest axes
- Update all label copy to sound human (third-person observer voice, no dashes)
- Add a shareable 1:1 profile identity card (Satori-rendered PNG)
- Add a collapsible 4-axis breakdown to the profile widget

---

## Non-Goals

- Changing how topArtists / topAlbums / topGenres are computed
- Mobile native share card (web only for now — same pattern as chart card)
- More than 4 axes (scope creep)
- Changing the taste matching / community recommendation system

---

## Architecture

### 1. The 4-Axis Model

Each axis is computed independently and returns a score 0–100 where 50 = neutral, 0 = fully left pole, 100 = fully right pole.

**Primary label** = axis with the highest deviation from 50 (most extreme), if deviation > 20 points. Below 20 = no strong signal on that axis.

**Secondary badge** = axis with the second-highest deviation, if deviation > 15 points.

If no axis exceeds the primary threshold: show "Well Rounded" with no badge (genuinely balanced listener, rare but valid).

---

#### Axis 1: RANGE — Nomad ↔ Devotee

**Signal:** `unique_artists / total_plays` (ratio), computed entirely from `user_listening_aggregates`.

```sql
unique_artists = COUNT(DISTINCT entity_id) WHERE entity_type='artist'
total_plays    = SUM(count) WHERE entity_type='track'
```

**Requirements:** total_plays ≥ 100 (otherwise axis is neutral — too noisy with fresh accounts)

**Scoring:**
```
ratio ≥ 0.45  →  score = 70 + (ratio - 0.45) / 0.55 × 30  (Nomad pole, 70–100)
ratio ≤ 0.10  →  score = 30 - (0.10 - ratio) / 0.10 × 30  (Devotee pole, 0–30)
0.10–0.45     →  score = linear interpolation 30–70 (neutral zone)
```

**Primary labels:** Genre Nomad (score > 70) | The Devotee (score < 30)
**Badge labels:** "Nomad" | "Devotee"

---

#### Axis 2: SIGNAL — Cultural Pulse ↔ The Archivist

**Signal:** `avg_track_popularity` (0–100 from Spotify, null if unavailable)

**Requirements:** Spotify popularity data available (not null). If null: axis is neutral — Last.fm-only users skip this axis.

**Scoring:**
```
popularity > 65  →  score = 70 + (popularity - 65) / 35 × 30  (Cultural Pulse, 70–100)
popularity < 40  →  score = 30 - (40 - popularity) / 40 × 30  (Archivist, 0–30)
40–65            →  score = linear interpolation 30–70 (neutral)
```

**Primary labels:** Cultural Pulse (score > 70) | The Archivist (score < 30)
**Badge labels:** "Mainstream" | "Underground"

---

#### Axis 3: MODE — Daily Ritual ↔ Session Maximalist

All signals computed from `user_listening_aggregates` — no raw log scan needed.

**Signal A (Sessions):** weekly play count proxy. Query `SUM(count) WHERE entity_type='track'` grouped by `week_start` for last 12 weeks. Max weekly plays > 200 = heavy session weeks.

**Signal B (Ritual):** weeks_with_plays / 12. Query count of distinct `week_start` values with `SUM(count) > 0` in the last 12 weeks. Fraction of active weeks = consistency signal.

**Requirements:** At least 4 weeks of aggregate data

**Sessions scoring (from max weekly track plays):**
```
max_week ≥ 350  →  score = 90
max_week ≥ 200  →  score = 80
max_week ≥ 100  →  score = 70
below 100       →  neutral toward 50
```

**Ritual scoring:**
```
active_weeks / 12 ≥ 0.75  →  score = 20
active_weeks / 12 ≥ 0.60  →  score = 30
below 0.60                 →  neutral toward 50
```

Sessions takes priority if both would fire.

**Primary labels:** Session Maximalist (score ≥ 80) | Daily Ritual (score ≤ 30)
**Badge labels:** "Sessions" | "Ritual"

---

#### Axis 4: DISCOVERY — Explorer ↔ Loyalist

All signals computed from `user_listening_aggregates` — no raw log self-join needed.

**Signal:** For each artist, find their `MIN(week_start)` in the user's aggregates (their "first encounter week"). Then compute what fraction of total plays in the last 4 weeks are to artists whose first encounter week also falls within those same 4 weeks.

```
new_artist_plays = SUM(count) WHERE entity_type='artist'
                   AND week_start >= 4_weeks_ago
                   AND artist_id IN (
                     SELECT entity_id WHERE entity_type='artist'
                     GROUP BY entity_id HAVING MIN(week_start) >= 4_weeks_ago
                   )

total_recent_plays = SUM(count) WHERE entity_type='artist' AND week_start >= 4_weeks_ago

new_artist_ratio = new_artist_plays / total_recent_plays
```

**Requirements:** ≥ 8 weeks of aggregate history AND ≥ 50 total plays in the last 4 weeks

**Scoring:**
```
ratio > 0.35  →  score = 70 + (ratio - 0.35) / 0.65 × 30  (Explorer, 70–100)
ratio < 0.05  →  score = 30 - (0.05 - ratio) / 0.05 × 30  (Loyalist, 0–30)
0.05–0.35     →  neutral 30–70
```

**Primary labels:** The Explorer (score > 70) | The Loyalist (score < 30)
**Badge labels:** "Explorer" | "Loyalist"

---

### 2. Updated Labels and Copy

#### Label definitions

```typescript
export type TasteListeningStyle =
  | "genre-nomad"          // Range: Nomad pole
  | "the-devotee"          // Range: Devotee pole
  | "cultural-pulse"       // Signal: Mainstream pole
  | "the-archivist"        // Signal: Underground pole
  | "session-maximalist"   // Mode: Sessions pole
  | "daily-ritual"         // Mode: Ritual pole
  | "the-explorer"         // Discovery: Explorer pole
  | "the-loyalist"         // Discovery: Loyalist pole
  | "well-rounded"         // No strong axis — genuinely balanced
  | "still-forming";       // Not enough data yet (< 100 plays total)
```

`still-forming` is a **state**, not a style — shown as an informational message, not as a personality label. No style card, no share button, just "Keep listening. The picture fills in over time."

#### Copy (title + subtitle + badge label)

| Key | Title | Subtitle | Badge |
|-----|-------|----------|-------|
| `genre-nomad` | Genre Nomad | Jazz one week, something completely different the next. Hard to pin down and the range is real. | Nomad |
| `the-devotee` | The Devotee | Has a handful of artists they actually care about. New stuff comes out and mostly they're going back to the same records. | Devotee |
| `cultural-pulse` | Cultural Pulse | Listens to a lot of popular music. Knows what's charting and is usually into it. | Mainstream |
| `the-archivist` | The Archivist | The kind of listener who sends you something you've never heard of, and then three months later everyone has it. | Underground |
| `session-maximalist` | Session Maximalist | Puts something on and two hours later is still going. Doesn't do background music. | Sessions |
| `daily-ritual` | Daily Ritual | Music runs through most of the day. Morning, commute, home. It stays on. | Ritual |
| `the-explorer` | The Explorer | The listening history from two months ago looks almost nothing like today. Moves through new music fast. | Explorer |
| `the-loyalist` | The Loyalist | Goes back to the same artists again and again. New music is fine but the same ones always win. | Loyalist |
| `well-rounded` | Well Rounded | No single axis dominates. Wide enough to explore, focused enough to go deep. | — |

#### Axis display names (for the breakdown widget)

| Axis | Left pole label | Right pole label |
|------|----------------|-----------------|
| Range | Devotee | Nomad |
| Signal | Underground | Mainstream |
| Mode | Ritual | Sessions |
| Discovery | Loyalist | Explorer |

#### Accent colors per style (for the share card background gradient)

| Style | Primary color | Gradient tones |
|-------|--------------|----------------|
| genre-nomad | `#10b981` emerald | emerald + cyan |
| the-devotee | `#f59e0b` amber | amber + orange |
| cultural-pulse | `#f59e0b` gold | gold + yellow |
| the-archivist | `#818cf8` indigo | indigo + violet |
| session-maximalist | `#6366f1` purple | purple + blue |
| daily-ritual | `#38bdf8` sky | sky + teal |
| the-explorer | `#34d399` green | green + emerald |
| the-loyalist | `#fb923c` orange | orange + red |
| well-rounded | `#a1a1aa` zinc | zinc + white |

---

### 3. New Data Types

```typescript
export type AxisScore = {
  score: number;        // 0–100, 50 = neutral
  deviation: number;    // |score - 50|
  pole: "left" | "right" | "neutral";
};

export type TasteAxes = {
  range: AxisScore;     // Devotee (0) ↔ Nomad (100)
  signal: AxisScore | null;  // null if no Spotify data
  mode: AxisScore | null;    // null if < 14 days history
  discovery: AxisScore | null; // null if < 30 days / 50 plays
};

export type TasteStyleResult = {
  primary: TasteListeningStyle;
  badge: string | null;        // short badge label, null if no strong secondary axis
  axes: TasteAxes;
};
```

`TasteStyleResult` is computed by the new `computeListeningStyle(admin, userId)` function and stored in `taste_identity_cache` alongside existing fields.

---

### 4. Share Card — `GET /api/profile/identity-card`

New endpoint and Satori template for a 1080×1080 PNG.

**Auth:** required (own profile only — the card shows your data)

**Template: `lib/taste/profile-identity-card-template.tsx`**

Layout (1080×1080):
- Background: style-specific gradient (from accent color table above), edge vignette, no grain
- Header bar: "Tracklist · @username"
- Center: hero label — large, bold (80–96px depending on length)
- Below label: secondary badge as a pill (if present)
- Subtitle copy (2 lines max, truncated)
- Genre tags row (top 3 genres from taste identity)
- Bottom: obscurity line — "More obscure than X% of listeners" (if obscurityScore available)

**Route:** `app/api/profile/identity-card/route.ts`
- Fetches `TasteIdentity` + `TasteStyleResult` for authenticated user
- Calls `extractAlbumPalette` on the user's top artist image to override gradient if a strong color is present (reuses existing utility)
- Returns `ImageResponse` 1080×1080
- `Cache-Control: private, max-age=3600` (shorter than chart card — identity can change week to week)

---

### 5. Profile Widget Redesign

**File:** `components/profile/taste-identity-display.tsx`

**Collapsed state (always visible):**
```
┌─────────────────────────────────────────┐
│ LISTENING STYLE                         │
│ Genre Nomad                             │
│ [Explorer]                   [Share ↗]  │
│ Jazz one week, something different...   │
│                     [Show breakdown ↓]  │
└─────────────────────────────────────────┘
```

**Expanded state (on click, same element):**
```
┌─────────────────────────────────────────┐
│ ... (collapsed content above)           │
│ ─────────────────────────────────────── │
│ Range          ●────────────────  Nomad │
│ Discovery      ──────●──────────  —     │
│ Mode           ──●──────────────  Ritual│
│ Signal         unavailable              │
│                                         │
│ Based on 847 plays across 512 artists   │
└─────────────────────────────────────────┘
```

Each axis row shows:
- Axis name (left)
- Position bar with dot indicating where the user sits
- Pole label at the user's end (right) — or "—" if neutral
- "unavailable" if the axis couldn't be computed (no Spotify data, not enough logs)

**Share button behavior:**
- Fetches PNG from `/api/profile/identity-card`
- Mobile (Web Share API with files): triggers native share sheet
- Desktop: downloads PNG
- Spinner while generating
- Same pattern as `ChartShareModal` but inline (no separate modal — just a button + feedback)

**Own profile only:** the share button and breakdown are only shown on own profile. Other users' profiles show the style label and subtitle only.

---

### 6. Files Changed

**New files:**
- `lib/taste/profile-identity-card-template.tsx` — Satori template 1080×1080
- `app/api/profile/identity-card/route.ts` — PNG generation endpoint
- `lib/taste/compute-taste-axes.ts` — the 4-axis scoring logic + helpers

**Modified files:**
- `lib/taste/listening-style.ts` — new `TasteListeningStyle` type, new copy, accent colors
- `lib/taste/taste-identity.ts` — call `computeListeningStyle` and store `TasteAxes` in cache; remove old `pickListeningStyle`
- `components/profile/taste-identity-display.tsx` — collapsed/expanded widget, share button
- `mobile/components/profile/TasteIdentity.tsx` — update label names + copy (no axes widget on mobile for now)

**Schema:** no migration needed — `TasteAxes` stored as JSON inside existing `taste_identity_cache.payload` alongside existing fields.

---

## Testing

- Unit: `computeListeningStyle` — verify each axis fires correctly for edge cases (null Spotify data, <100 plays, <30 days)
- Unit: axis score math — verify Nomad at ratio=0.6 scores ~70, Devotee at ratio=0.05 scores ~27
- Unit: primary/badge selection — verify highest-deviation axis wins; badge fires only if second axis > 15 deviation
- Integration: `GET /api/profile/identity-card` returns `Content-Type: image/png` with 200
- Manual: verify 5 test users each get distinct primary labels after re-running taste refresh cron

---

## Computation and Cron

Axes are computed inside the existing `refreshTasteIdentityCacheForUser` function, which is called by the `/api/cron/taste-identity-refresh` cron. No new cron job needed.

Because all four axes now read from `user_listening_aggregates` (except Signal which reads from the existing `obscurityScore` already computed), the computation is fast — a handful of aggregate queries, no raw log scans.

The `TasteStyleResult` (primary label, badge, all axis scores) is stored as a new `styleResult` field inside the existing `taste_identity_cache.payload` JSON. No schema migration required.

**Cron frequency:** the taste-identity-refresh cron currently runs daily. Axes are cheap enough to compute on every run. The style label is unlikely to flip daily but computing it daily means it stays current when listening patterns shift meaningfully.

---

## Open Questions

1. **`well-rounded` label:** product decision confirmed — "Well Rounded" is the name. Subtitle: "No single axis dominates. Broad enough to cover ground, focused enough to go deep."
2. **Signal axis for Last.fm users:** obscurityScore (already computed from Spotify popularity in `computeTasteIdentity`) serves as the proxy — if `obscurityScore` is available, derive Signal axis from it. If null, axis is neutral. No change to existing obscurity computation needed.
