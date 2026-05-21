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

**Signal:** `unique_artists / total_plays` (ratio)

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

**Signal A (Sessions):** `max_logs_any_single_day` from recent 90 days of logs
**Signal B (Ritual):** `active_days / total_days` for last 90 days AND average daily plays 5–25

**Requirements:** At least 14 days of log history

**Sessions scoring:**
```
max_day ≥ 80  →  score = 90
max_day ≥ 60  →  score = 80
max_day ≥ 40  →  score = 70
below 40      →  neutral toward 50
```

**Ritual scoring (must satisfy ALL):**
- active_days / 90 > 0.60 (listens on 60%+ of days)
- avg daily plays between 5 and 25
- If both satisfied: score = 30 - (active_rate - 0.60) / 0.40 × 20 (Ritual pole, 10–30)

Sessions takes priority if both would fire (heavy daily listener is a session maximalist, not a ritualist).

**Primary labels:** Session Maximalist (score ≥ 80) | Daily Ritual (score ≤ 30)
**Badge labels:** "Sessions" | "Ritual"

**Implementation note:** requires a query on `logs` grouped by date for the last 90 days — not available from weekly aggregates. New helper function `getDailyLogStats(userId, days=90)`.

---

#### Axis 4: DISCOVERY — Explorer ↔ Loyalist

**Signal:** In the last 30 days of logs, what fraction of plays are to artists the user had never listened to before that 30-day window?

```
new_artist_ratio = plays_to_first_time_artists / total_plays_in_30d
```

"First time" = `artist_id` appears in last-30-day logs AND has zero plays in logs before that window.

**Requirements:** ≥ 30 days of log history AND ≥ 50 plays in the last 30 days (otherwise axis neutral)

**Scoring:**
```
ratio > 0.35  →  score = 70 + (ratio - 0.35) / 0.65 × 30  (Explorer, 70–100)
ratio < 0.05  →  score = 30 - (0.05 - ratio) / 0.05 × 30  (Loyalist, 0–30)
0.05–0.35     →  neutral 30–70
```

**Primary labels:** The Explorer (score > 70) | The Loyalist (score < 30)
**Badge labels:** "Explorer" | "Loyalist"

**Implementation note:** requires a self-join or subquery on `logs` to find artist_ids with zero pre-window history. New helper `getDiscoveryRate(userId)`.

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

## Open Questions

1. **`getDailyLogStats` query cost:** querying raw logs for 90 days to compute max/active days could be slow for heavy users (10k+ logs). Should cap at 90 days and sample if needed. Flag for implementer.
2. **`getDiscoveryRate` self-join:** finding "first-time artists in last 30 days" requires comparing last-30-day artist IDs against all prior log history. For users with large log history, this could be expensive. Consider limiting to checking against `user_listening_aggregates` (by-artist aggregate) instead of raw logs.
3. **`well-rounded` label:** is "Well Rounded" positive enough that users won't feel it's a consolation prize? Alternative: "The Purist" for users with a very consistent, focused but not extreme pattern. Flagging for product decision.
