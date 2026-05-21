# Listening Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the web listening report with a Charts-Magazine visual and create a new mobile screen at `/(tabs)/reports/listening` to fix the broken "Full report →" navigation from the mobile profile page.

**Architecture:** Web: replace the inline compare-text block with a 4-card stat strip, extract rank #1 as an emerald hero card, wrap ranks 2+ in a single grouped card. Mobile: new `FlatList`-based screen with a sticky segmented control + range pill that opens a `Modal` bottom sheet; a new `useListeningReport` hook handles fetching.

**Tech Stack:** Next.js App Router (web), Expo Router + React Native (mobile), TanStack Query, existing `fetcher()` API client, `Artwork` + `SkeletonBox` components, `useSafeAreaInsets`.

---

## File Map

| File | Action |
|------|--------|
| `app/reports/(tabs)/listening/listening-reports-client.tsx` | Modify — stat strip, hero row, grouped list, controls reorganisation |
| `mobile/lib/hooks/useListeningReport.ts` | **Create** — fetches `/api/reports` + `/api/reports/compare` |
| `mobile/app/(tabs)/reports/listening.tsx` | **Create** — full mobile screen |
| `mobile/components/profile/ProfileContent.tsx` | Modify — fix two `router.push` paths |

---

## Part A — Web Redesign

### Task 1: Replace compare-text with 4-card stat strip

**Files:**
- Modify: `app/reports/(tabs)/listening/listening-reports-client.tsx`

The current `compareLine` JSX renders a text paragraph. Replace it with a 4-card grid row.

- [ ] **Step 1: Locate the compareLine block and replace it**

Find this block (around line 476):
```tsx
const compareLine =
  compare && range !== "custom" ? (
    <div className="rounded-xl ...">
      <p className="mt-1 text-zinc-400">...</p>
      ...
    </div>
  ) : null;
```

Replace it with:
```tsx
const statStrip =
  compare && range !== "custom" ? (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Total plays */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Total plays</p>
        <p className="mt-1.5 text-2xl font-bold text-white">{compare.totalPlaysCurrent.toLocaleString()}</p>
        {compare.percentChange != null && (
          <p className={`mt-0.5 text-xs font-medium ${compare.percentChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {compare.percentChange >= 0 ? "↑" : "↓"} {compare.percentChange >= 0 ? "+" : ""}{compare.percentChange.toFixed(0)}% vs prior
          </p>
        )}
      </div>
      {/* Top gainer */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Top gainer</p>
        {compare.topGainer ? (
          <>
            <p className="mt-1.5 text-sm font-bold leading-tight text-white">{compare.topGainer.name}</p>
            <p className="mt-0.5 text-xs font-medium text-emerald-400">+{compare.topGainer.movement} spots</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-500">—</p>
        )}
      </div>
      {/* New entries */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">New entries</p>
        <p className="mt-1.5 text-2xl font-bold text-white">
          {data?.items.filter((r) => r.isNew).length ?? 0}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">not in prior period</p>
      </div>
      {/* Top dropper */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Top dropper</p>
        {compare.topDropper ? (
          <>
            <p className="mt-1.5 text-sm font-bold leading-tight text-white">{compare.topDropper.name}</p>
            <p className="mt-0.5 text-xs font-medium text-red-400">{compare.topDropper.movement} spots</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-500">—</p>
        )}
      </div>
    </div>
  ) : null;
```

Note: `compare.topGainer` and `compare.topDropper` currently only have `{ entityId, name }`. The `movement` field needs to come from the report items. Add a helper just before the `statStrip` const:

```tsx
const topGainerMovement = compare?.topGainer
  ? (data?.items.find((r) => r.entityId === compare.topGainer!.entityId)?.movement ?? null)
  : null;
const topDropperMovement = compare?.topDropper
  ? (data?.items.find((r) => r.entityId === compare.topDropper!.entityId)?.movement ?? null)
  : null;
```

Update the stat strip to use `topGainerMovement` and `topDropperMovement` instead of `compare.topGainer.movement`.

- [ ] **Step 2: Replace `{compareLine}` with `{statStrip}` in the return JSX**

In the `return (...)` block (around line 539), replace `{compareLine}` with `{statStrip}`.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/reports/\(tabs\)/listening/listening-reports-client.tsx
git commit -m "feat: listening report web — 4-card stat strip replaces compare text"
```

---

### Task 2: Extract rank #1 hero + grouped list for ranks 2+

**Files:**
- Modify: `app/reports/(tabs)/listening/listening-reports-client.tsx`

The current virtualizer renders all rows identically. Rank #1 needs a hero card; ranks 2+ live inside a single rounded card with dividers.

- [ ] **Step 1: Add Next.js Image import at the top of the file**

Find the existing imports at the top. Add:
```tsx
import Image from "next/image";
```

- [ ] **Step 2: Adjust virtualizer to skip rank #1**

Find:
```tsx
const reportRows = data?.items ?? [];
```

Replace with:
```tsx
const reportRows = data?.items ?? [];
const heroRow = reportRows[0] ?? null;
const listRows = reportRows.slice(1);
```

Find:
```tsx
const reportVirtualizer = useVirtualizer({
  count: reportRows.length,
```

Change to:
```tsx
const reportVirtualizer = useVirtualizer({
  count: listRows.length,
```

Find every reference to `reportRows[virtualRow.index]` inside the virtualizer render and change it to `listRows[virtualRow.index]`.

- [ ] **Step 3: Add the hero card above the virtualizer container**

Find the `{data && data.items.length > 0 ? (` block. Inside it, before the `<div ref={reportListParentRef}` virtualizer container, add:

```tsx
{heroRow && (
  <div className="flex overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
    {/* Emerald rank panel */}
    <div className="flex w-16 shrink-0 items-center justify-center bg-gradient-to-b from-emerald-600 to-emerald-800">
      <span className="text-2xl font-black text-white/90">#1</span>
    </div>
    {/* Album art */}
    <div className="relative my-3 ml-4 h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
      {heroRow.image ? (
        <Image src={heroRow.image} alt="" fill sizes="56px" className="object-cover" priority />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-500">♪</div>
      )}
    </div>
    {/* Meta */}
    <div className="min-w-0 flex-1 py-3 pl-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
        {RANGES.find((r) => r.value === range)?.label} · {TYPES.find((t) => t.value === entityType)?.label}
      </p>
      <p className="mt-1 truncate text-lg font-bold text-white">{heroRow.name}</p>
      <p className="text-xs text-zinc-500">{heroRow.count} plays</p>
    </div>
    {/* Movement */}
    <div className="flex shrink-0 items-center px-4">
      {heroRow.isNew ? (
        <span className="text-xs italic text-zinc-400">New entry</span>
      ) : (
        <span className={`text-sm font-semibold tabular-nums ${
          heroRow.movement != null && heroRow.movement > 0 ? "text-emerald-400"
          : heroRow.movement != null && heroRow.movement < 0 ? "text-red-400"
          : "text-zinc-500"
        }`}>
          {formatMovement(heroRow.movement, heroRow.isNew)}
        </span>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Wrap the virtualizer container in a grouped card**

The virtualizer `<div ref={reportListParentRef} ...>` currently has `className="max-h-[min(70vh,640px)] overflow-auto"`. Wrap it in:

```tsx
{listRows.length > 0 && (
  <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-800">
    <div ref={reportListParentRef} className="max-h-[min(70vh,640px)] overflow-auto">
      {/* virtualizer content unchanged */}
    </div>
  </div>
)}
```

- [ ] **Step 5: Update individual row styling inside the virtualizer**

Each virtual row currently renders a card with its own `rounded-lg border`. Replace the inner card `div` styling with a flat row:

Old:
```tsx
<div className={`flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 transition ${row.isNew ? "border-violet-500/30 bg-violet-950/20" : ""}`}>
```

New (no individual card, just divider):
```tsx
<div className={`flex items-center gap-3 px-4 py-3 ${virtualRow.index < listRows.length - 1 ? "border-b border-zinc-800/60" : ""} ${row.isNew ? "bg-violet-950/10" : ""}`}>
```

Replace the `<img>` tag inside the row with:
```tsx
{row.image ? (
  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800">
    <Image src={row.image} alt="" fill sizes="40px" className="object-cover" />
  </div>
) : (
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-500">♪</div>
)}
```

Change rank number style: `<span className="w-8 text-sm tabular-nums text-zinc-500">` → `<span className="w-7 text-base font-bold tabular-nums text-zinc-600">`.

- [ ] **Step 6: Verify empty-state guard still works**

The current `{data && data.items.length === 0 && !loading}` check applies to `reportRows`. Since `heroRow` and `listRows` are derived from `reportRows`, this guard is unchanged. Confirm it still renders "No plays in this period yet." correctly by reading the guard — no change needed.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/reports/\(tabs\)/listening/listening-reports-client.tsx
git commit -m "feat: listening report web — hero row for #1, grouped card for ranks 2+"
```

---

### Task 3: Reorganise controls row — range left, entity right, share+save same row

**Files:**
- Modify: `app/reports/(tabs)/listening/listening-reports-client.tsx`

- [ ] **Step 1: Find the current controls section**

The current layout (around line 543) has:
1. A `div.flex.flex-wrap.gap-2` with range pills
2. `range === "custom"` date inputs block
3. A `div.space-y-4` containing entity pills + a separate row for share/save buttons

Replace the entire region from `<div className="flex flex-wrap gap-2">` (range pills) through the share/save buttons row with:

```tsx
{/* Controls: range left, entity right, share+save far right */}
<div className="flex flex-wrap items-center gap-3">
  {/* Range pills */}
  <div className="flex flex-wrap gap-1.5">
    {RANGES.map((r) => (
      <button
        key={r.value}
        type="button"
        onClick={() => selectRange(r.value)}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
          range === r.value
            ? "bg-emerald-600 text-white"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
      >
        {r.label}
      </button>
    ))}
  </div>

  {/* Entity pills — pushed to the right on wider screens */}
  <div className="flex flex-wrap gap-1.5 sm:ml-auto">
    {TYPES.map((t) => (
      <button
        key={t.value}
        type="button"
        onClick={() => selectEntity(t.value)}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
          entityType === t.value
            ? "bg-violet-600 text-white"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>

  {/* Share + Save */}
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() => openShareFromCurrent()}
      disabled={loading || (range === "custom" && (!startDate || !endDate)) || !data?.items.length}
      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
    >
      Share
    </button>
    <button
      type="button"
      onClick={() => void savePrivate()}
      disabled={savingPrivate || loading || (range === "custom" && (!startDate || !endDate)) || !data?.items.length}
      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
    >
      {savingPrivate ? "Saving…" : "Save"}
    </button>
  </div>
</div>

{/* Custom date inputs — only visible when Custom is selected */}
{range === "custom" ? (
  <div className="flex flex-wrap items-end gap-3">
    <label className="text-sm text-zinc-400">
      Start
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-white"
      />
    </label>
    <label className="text-sm text-zinc-400">
      End
      <input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-white"
      />
    </label>
    <button
      type="button"
      onClick={() => applyCustom()}
      disabled={!startDate || !endDate || loading}
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
    >
      Apply
    </button>
  </div>
) : null}
```

- [ ] **Step 2: Remove the now-duplicate share/save button block**

The old large `Share report` and `Save privately` buttons (the `div.flex.flex-col.gap-2.sm:flex-row` section around line 609) are replaced by the new Share/Save in the controls row above. Delete that entire block.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/reports/\(tabs\)/listening/listening-reports-client.tsx
git commit -m "feat: listening report web — controls row reorganised, share+save in line"
```

---

## Part B — Mobile New Screen

### Task 4: Create useListeningReport hook

**Files:**
- Create: `mobile/lib/hooks/useListeningReport.ts`
- Test: `mobile/lib/hooks/useListeningReport.test.ts` (if unit test infra is available — skip if not)

- [ ] **Step 1: Create the hook file**

Create `mobile/lib/hooks/useListeningReport.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { useAuth } from "./useAuth";

export type ReportRange = "week" | "month" | "year" | "custom";
export type ReportEntityType = "artist" | "album" | "track" | "genre";

export type ReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  rank: number;
  previousRank: number | null;
  movement: number | null;
  isNew: boolean;
};

export type ReportPayload = {
  items: ReportItem[];
  range: ReportRange;
  periodLabel: string;
  nextOffset: number | null;
};

export type ComparePayload = {
  totalPlaysCurrent: number;
  totalPlaysPrevious: number;
  percentChange: number | null;
  topGainer: { entityId: string; name: string } | null;
  topDropper: { entityId: string; name: string } | null;
};

type Params = {
  range: ReportRange;
  entityType: ReportEntityType;
  startDate?: string;
  endDate?: string;
  offset?: number;
  limit?: number;
};

function buildReportUrl(userId: string, params: Params): string {
  const q = new URLSearchParams({
    userId,
    type: params.entityType,
    range: params.range,
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.range === "custom" && params.startDate) q.set("startDate", params.startDate);
  if (params.range === "custom" && params.endDate) q.set("endDate", params.endDate);
  return `/api/reports?${q.toString()}`;
}

function buildCompareUrl(userId: string, params: Params): string {
  const q = new URLSearchParams({
    userId,
    type: params.entityType,
    range: params.range,
  });
  if (params.range === "custom" && params.startDate) q.set("startDate", params.startDate);
  if (params.range === "custom" && params.endDate) q.set("endDate", params.endDate);
  return `/api/reports/compare?${q.toString()}`;
}

export function useListeningReport(params: Params) {
  const { session, isLoading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const enabled =
    !!userId &&
    !authLoading &&
    (params.range !== "custom" || (!!params.startDate && !!params.endDate));

  const report = useQuery<ReportPayload>({
    queryKey: ["listening-report", userId, params.range, params.entityType, params.startDate, params.endDate, params.offset],
    queryFn: () => fetcher<ReportPayload>(buildReportUrl(userId!, params)),
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  const compare = useQuery<ComparePayload>({
    queryKey: ["listening-report-compare", userId, params.range, params.entityType, params.startDate, params.endDate],
    queryFn: () => fetcher<ComparePayload>(buildCompareUrl(userId!, params)),
    enabled: enabled && params.range !== "custom",
    staleTime: 2 * 60 * 1000,
  });

  return { report, compare };
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/lib/hooks/useListeningReport.ts
git commit -m "feat: mobile listening report — useListeningReport hook"
```

---

### Task 5: Create the mobile listening report screen

**Files:**
- Create: `mobile/app/(tabs)/reports/listening.tsx`

- [ ] **Step 1: Create the file with all types and helpers**

Create `mobile/app/(tabs)/reports/listening.tsx`:

```tsx
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { SkeletonBox, SkeletonLine } from "@/components/ui/Skeleton";
import {
  useListeningReport,
  type ReportEntityType,
  type ReportItem,
  type ReportRange,
} from "@/lib/hooks/useListeningReport";
import { useAuth } from "@/lib/hooks/useAuth";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TABS: { value: ReportEntityType; label: string }[] = [
  { value: "artist", label: "Artists" },
  { value: "album", label: "Albums" },
  { value: "track", label: "Tracks" },
  { value: "genre", label: "Genres" },
];

const RANGE_CHIPS: { value: ReportRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

// ─── Movement badge ────────────────────────────────────────────────────────────

function MovementBadge({ movement, isNew }: { movement: number | null; isNew: boolean }) {
  if (isNew) return <Text style={s.movementNew}>NEW</Text>;
  if (movement == null || movement === 0) return <Text style={s.movementFlat}>—</Text>;
  if (movement > 0) return <Text style={s.movementUp}>↑ +{movement}</Text>;
  return <Text style={s.movementDown}>↓ {movement}</Text>;
}

// ─── Hero row (#1) ─────────────────────────────────────────────────────────────

function HeroRow({ item, entityType, periodLabel }: { item: ReportItem; entityType: ReportEntityType; periodLabel: string }) {
  return (
    <View style={s.heroCard}>
      <View style={s.heroRankPanel}>
        <Text style={s.heroRankText}>#1</Text>
      </View>
      <View style={s.heroArtWrap}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={s.heroArt}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[s.heroArt, s.artPlaceholder]}>
            <Text style={s.artGlyph}>♪</Text>
          </View>
        )}
      </View>
      <View style={s.heroMeta}>
        <Text style={s.heroLabel} numberOfLines={1}>
          {periodLabel}
        </Text>
        <Text style={s.heroName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.heroPlays}>{item.count} plays</Text>
      </View>
      <View style={s.heroMovement}>
        <MovementBadge movement={item.movement} isNew={item.isNew} />
      </View>
    </View>
  );
}

// ─── List row (ranks 2+) ────────────────────────────────────────────────────────

function ListRow({ item, isLast }: { item: ReportItem; isLast: boolean }) {
  return (
    <View style={[s.listRow, !isLast && s.listRowDivider]}>
      <Text style={s.listRank}>{item.rank}</Text>
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={s.listArt}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={item.image}
        />
      ) : (
        <View style={[s.listArt, s.artPlaceholder]}>
          <Text style={s.artGlyph}>♪</Text>
        </View>
      )}
      <View style={s.listMeta}>
        <Text style={s.listName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.listPlays}>{item.count} plays</Text>
      </View>
      <MovementBadge movement={item.movement} isNew={item.isNew} />
    </View>
  );
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────

function StatBar({
  totalPlays,
  percentChange,
  newCount,
  topGainerName,
}: {
  totalPlays: number;
  percentChange: number | null;
  newCount: number;
  topGainerName: string | null;
}) {
  return (
    <View style={s.statBar}>
      <View style={[s.statCol, s.statColBorder]}>
        <Text style={s.statLabel}>Plays</Text>
        <Text style={s.statValue}>{totalPlays.toLocaleString()}</Text>
        {percentChange != null && (
          <Text style={[s.statSub, percentChange >= 0 ? s.statUp : s.statDown]}>
            {percentChange >= 0 ? "↑" : "↓"} {percentChange >= 0 ? "+" : ""}{percentChange.toFixed(0)}%
          </Text>
        )}
      </View>
      <View style={[s.statCol, s.statColBorder]}>
        <Text style={s.statLabel}>New</Text>
        <Text style={s.statValue}>{newCount}</Text>
        <Text style={s.statSub}>entries</Text>
      </View>
      <View style={s.statCol}>
        <Text style={s.statLabel}>Top gainer</Text>
        <Text style={[s.statValue, s.statValueSmall]} numberOfLines={1}>{topGainerName ?? "—"}</Text>
      </View>
    </View>
  );
}

// ─── Range bottom sheet ────────────────────────────────────────────────────────

function RangeSheet({
  visible,
  range,
  startDate,
  endDate,
  onSelect,
  onApplyCustom,
  onClose,
}: {
  visible: boolean;
  range: ReportRange;
  startDate: string;
  endDate: string;
  onSelect: (r: ReportRange) => void;
  onApplyCustom: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  function handleChip(r: ReportRange) {
    if (r !== "custom") {
      onSelect(r);
      onClose();
    } else {
      onSelect("custom");
    }
  }

  function handleApply() {
    if (!localStart || !localEnd) return;
    onApplyCustom(localStart, localEnd);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetOverlay} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Period</Text>

        {/* Range chips */}
        <View style={s.chipRow}>
          {RANGE_CHIPS.map((chip) => (
            <Pressable
              key={chip.value}
              onPress={() => handleChip(chip.value)}
              style={[s.chip, range === chip.value && s.chipActive]}
            >
              <Text style={[s.chipText, range === chip.value && s.chipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Custom date inputs — shown when Custom is selected */}
        {range === "custom" && (
          <View style={s.customWrap}>
            <Text style={s.customLabel}>Custom range</Text>
            <View style={s.customRow}>
              <View style={s.dateField}>
                <Text style={s.dateFieldLabel}>From</Text>
                {/* Native date input: TextInput with placeholder, user types YYYY-MM-DD */}
                <Text
                  style={s.dateFieldValue}
                  onPress={() => {/* handled by TextInput below */}}>
                  {localStart || "YYYY-MM-DD"}
                </Text>
              </View>
              <Text style={s.dateSep}>→</Text>
              <View style={s.dateField}>
                <Text style={s.dateFieldLabel}>To</Text>
                <Text style={s.dateFieldValue}>{localEnd || "YYYY-MM-DD"}</Text>
              </View>
            </View>
            {/* Actual text inputs below the display */}
            <View style={s.customInputRow}>
              <View style={s.customInputWrap}>
                <Text style={s.customInputLabel}>From (YYYY-MM-DD)</Text>
                <View style={s.customInput}>
                  <Text
                    style={s.customInputText}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {...{ editable: true, onChangeText: setLocalStart, value: localStart, placeholder: "2026-01-01", placeholderTextColor: "#52525b", keyboardType: "numeric" } as any}
                  />
                </View>
              </View>
              <View style={s.customInputWrap}>
                <Text style={s.customInputLabel}>To (YYYY-MM-DD)</Text>
                <View style={s.customInput}>
                  <Text
                    style={s.customInputText}
                    {...{ editable: true, onChangeText: setLocalEnd, value: localEnd, placeholder: "2026-12-31", placeholderTextColor: "#52525b", keyboardType: "numeric" } as any}
                  />
                </View>
              </View>
            </View>
            <Pressable
              style={[s.applyBtn, (!localStart || !localEnd) && s.applyBtnDisabled]}
              onPress={handleApply}
              disabled={!localStart || !localEnd}
            >
              <Text style={s.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ListeningReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [entityType, setEntityType] = useState<ReportEntityType>("artist");
  const [range, setRange] = useState<ReportRange>("week");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { report, compare } = useListeningReport({ range, entityType, startDate, endDate });

  const items = report.data?.items ?? [];
  const heroItem = items[0] ?? null;
  const listItems = items.slice(1);
  const isLoading = report.isLoading;
  const hasData = items.length > 0;

  const rangeLabel = RANGE_CHIPS.find((c) => c.value === range)?.label ?? "Week";

  function applyCustom(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
  }

  async function handleShare() {
    if (!items.length) return;
    const top3 = items.slice(0, 3).map((r, i) => `${i + 1}. ${r.name} (${r.count} plays)`).join(", ");
    const label = ENTITY_TABS.find((t) => t.value === entityType)?.label ?? "Artists";
    await Share.share({
      message: `My top ${label} ${rangeLabel.toLowerCase()} on Tracklist: ${top3}`,
    });
  }

  const renderItem = useCallback(({ item, index }: { item: ReportItem; index: number }) => (
    <ListRow item={item} isLast={index === listItems.length - 1} />
  ), [listItems.length]);

  const listHeader = (
    <>
      {/* Stat bar */}
      {compare.data && (
        <StatBar
          totalPlays={compare.data.totalPlaysCurrent}
          percentChange={compare.data.percentChange}
          newCount={items.filter((r) => r.isNew).length}
          topGainerName={compare.data.topGainer?.name ?? null}
        />
      )}
      {/* Hero row */}
      {heroItem && (
        <HeroRow
          item={heroItem}
          entityType={entityType}
          periodLabel={report.data?.periodLabel ?? rangeLabel}
        />
      )}
      {/* Grouped card header */}
      {listItems.length > 0 && <View style={s.groupedCardTop} />}
    </>
  );

  const listFooter = listItems.length > 0 ? <View style={s.groupedCardBottom} /> : null;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={s.navBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.emerald} />
        </Pressable>
        <Text style={s.navTitle}>Listening Report</Text>
        <Pressable onPress={handleShare} style={s.shareBtn} disabled={!hasData}>
          <Text style={[s.shareText, !hasData && s.shareBtnDisabled]}>Share</Text>
        </Pressable>
      </View>

      {/* Sticky controls */}
      <View style={s.controls}>
        {/* Entity segmented */}
        <View style={s.segmentedWrap}>
          {ENTITY_TABS.map((tab) => (
            <Pressable
              key={tab.value}
              style={[s.segment, entityType === tab.value && s.segmentActive]}
              onPress={() => setEntityType(tab.value)}
            >
              <Text style={[s.segmentText, entityType === tab.value && s.segmentTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Range pill */}
        <Pressable style={s.rangePill} onPress={() => setSheetOpen(true)}>
          <Text style={s.rangePillText}>{rangeLabel} </Text>
          <Ionicons name="chevron-down" size={12} color={theme.colors.emerald} />
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={s.skeletonWrap}>
          <SkeletonBox height={72} radius={14} style={s.skeletonHero} />
          <SkeletonBox height={48} radius={0} />
          <SkeletonBox height={48} radius={0} />
          <SkeletonBox height={48} radius={0} />
        </View>
      ) : report.isError ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>Could not load report.</Text>
          <Pressable onPress={() => report.refetch()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !hasData ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No plays in this period yet.</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.entityId}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Range bottom sheet */}
      <RangeSheet
        visible={sheetOpen}
        range={range}
        startDate={startDate}
        endDate={endDate}
        onSelect={setRange}
        onApplyCustom={applyCustom}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  // Nav
  navBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { marginRight: 8 },
  navTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: theme.colors.text },
  shareBtn: { paddingLeft: 8 },
  shareText: { fontSize: 14, fontWeight: "600", color: theme.colors.emerald },
  shareBtnDisabled: { opacity: 0.4 },
  // Controls
  controls: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  segmentedWrap: { flex: 1, flexDirection: "row", backgroundColor: "#111113", borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segmentActive: { backgroundColor: "#7c3aed" },
  segmentText: { fontSize: 10, fontWeight: "600", color: theme.colors.muted },
  segmentTextActive: { color: "#fff" },
  rangePill: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.panel, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  rangePillText: { fontSize: 11, fontWeight: "700", color: theme.colors.emerald },
  // Stat bar
  statBar: { flexDirection: "row", marginBottom: 10, marginTop: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: theme.colors.panel },
  statCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  statColBorder: { borderRightWidth: 1, borderRightColor: theme.colors.border },
  statLabel: { fontSize: 9, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  statValue: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  statValueSmall: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  statSub: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  statUp: { color: theme.colors.emerald },
  statDown: { color: "#ef4444" },
  // Hero row
  heroCard: { flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, marginBottom: 8 },
  heroRankPanel: { width: 60, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },
  heroRankText: { fontSize: 22, fontWeight: "900", color: "rgba(255,255,255,0.9)" },
  heroArtWrap: { width: 44, height: 44, margin: 10, borderRadius: 7, overflow: "hidden", backgroundColor: theme.colors.active, flexShrink: 0 },
  heroArt: { width: 44, height: 44 },
  heroMeta: { flex: 1, paddingVertical: 10, paddingLeft: 4, justifyContent: "center" },
  heroLabel: { fontSize: 9, fontWeight: "600", color: theme.colors.emerald, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  heroName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  heroPlays: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  heroMovement: { paddingHorizontal: 12, justifyContent: "center" },
  // Grouped card
  groupedCardTop: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: theme.colors.border, height: 0 },
  groupedCardBottom: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderWidth: 1, borderTopWidth: 0, borderColor: theme.colors.border, height: 0 },
  // List rows
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.colors.panel },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  listRank: { width: 22, fontSize: 14, fontWeight: "800", color: "#52525b", textAlign: "center" },
  listArt: { width: 36, height: 36, borderRadius: 6 },
  listMeta: { flex: 1 },
  listName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  listPlays: { fontSize: 10, color: theme.colors.muted },
  // Movement badges
  movementUp: { fontSize: 11, fontWeight: "600", color: theme.colors.emerald, minWidth: 36, textAlign: "right" },
  movementDown: { fontSize: 11, fontWeight: "600", color: "#ef4444", minWidth: 36, textAlign: "right" },
  movementFlat: { fontSize: 11, color: theme.colors.muted, minWidth: 36, textAlign: "right" },
  movementNew: { fontSize: 9, fontWeight: "700", color: "#a78bfa", fontStyle: "italic", minWidth: 36, textAlign: "right" },
  // Art placeholder
  artPlaceholder: { backgroundColor: theme.colors.active, alignItems: "center", justifyContent: "center" },
  artGlyph: { fontSize: 14, color: theme.colors.muted },
  // Skeleton
  skeletonWrap: { padding: 14, gap: 6 },
  skeletonHero: { marginBottom: 2 },
  // Empty / error
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: 14, color: theme.colors.muted, textAlign: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: theme.colors.active, borderRadius: 10 },
  retryText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#18181b", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderColor: theme.colors.border },
  sheetHandle: { width: 36, height: 4, backgroundColor: theme.colors.active, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 14 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.active },
  chipActive: { backgroundColor: theme.colors.emerald },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.colors.muted },
  chipTextActive: { color: "#fff" },
  // Custom date
  customWrap: { marginTop: 14 },
  customLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  customRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  dateField: { flex: 1, backgroundColor: theme.colors.active, borderRadius: 9, padding: 10 },
  dateFieldLabel: { fontSize: 10, color: theme.colors.muted, marginBottom: 3 },
  dateFieldValue: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  dateSep: { fontSize: 14, color: theme.colors.muted },
  customInputRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  customInputWrap: { flex: 1 },
  customInputLabel: { fontSize: 10, color: theme.colors.muted, marginBottom: 4 },
  customInput: { backgroundColor: theme.colors.active, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  customInputText: { fontSize: 13, color: theme.colors.text },
  applyBtn: { backgroundColor: theme.colors.emerald, borderRadius: 12, padding: 13, alignItems: "center" },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
```

- [ ] **Step 2: Fix the custom date TextInput**

The `<Text {...{editable: true, ...}}` pattern above is a workaround to avoid a type error, but TextInput is cleaner. Replace each `<Text editable ...>` with a proper import:

At the top of the file, `TextInput` is already in the imports. Replace the two `<Text {...{editable...}}` nodes with:

```tsx
{/* From input */}
<TextInput
  style={s.customInputText}
  value={localStart}
  onChangeText={setLocalStart}
  placeholder="2026-01-01"
  placeholderTextColor="#52525b"
  keyboardType="numeric"
/>
```
and similarly for `localEnd`. Remove the `<Text>` wrappers around the visual display and the `<Text {...{editable...}}` lines entirely — just use the `<TextInput>` directly inside `customInputWrap`.

Also simplify `customRow` display dates to just show the TextInput values inline rather than a separate display row.

Final `customWrap` content:
```tsx
<View style={s.customWrap}>
  <Text style={s.customLabel}>Custom range</Text>
  <View style={s.customInputRow}>
    <View style={s.customInputWrap}>
      <Text style={s.customInputLabel}>From</Text>
      <View style={s.customInput}>
        <TextInput
          style={s.customInputText}
          value={localStart}
          onChangeText={setLocalStart}
          placeholder="2026-01-01"
          placeholderTextColor="#52525b"
        />
      </View>
    </View>
    <View style={s.customInputWrap}>
      <Text style={s.customInputLabel}>To</Text>
      <View style={s.customInput}>
        <TextInput
          style={s.customInputText}
          value={localEnd}
          onChangeText={setLocalEnd}
          placeholder="2026-05-21"
          placeholderTextColor="#52525b"
        />
      </View>
    </View>
  </View>
  <Pressable
    style={[s.applyBtn, (!localStart || !localEnd) && s.applyBtnDisabled]}
    onPress={handleApply}
    disabled={!localStart || !localEnd}
  >
    <Text style={s.applyBtnText}>Apply</Text>
  </Pressable>
</View>
```

Remove `customRow`, `dateField`, `dateFieldLabel`, `dateFieldValue`, `dateSep` from the styles (they're unused after this cleanup).

- [ ] **Step 3: Run mobile typecheck**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep "reports/listening" || echo "no errors in new file"
```

Expected: no errors in the new file (pre-existing unrelated errors are OK).

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(tabs\)/reports/listening.tsx
git commit -m "feat: mobile listening report screen"
```

---

### Task 6: Fix navigation in ProfileContent + hide screen from tab bar

**Files:**
- Modify: `mobile/components/profile/ProfileContent.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Fix both router.push calls in ProfileContent.tsx**

Open `mobile/components/profile/ProfileContent.tsx`. Find both occurrences of:
```ts
router.push("/reports/listening" as never)
```

Replace both with:
```ts
router.push("/(tabs)/reports/listening" as never)
```

- [ ] **Step 2: Hide the route from the tab bar**

Open `mobile/app/(tabs)/_layout.tsx`. After the last `<Tabs.Screen>` entry (before `</Tabs>`), add:

```tsx
<Tabs.Screen
  name="reports/listening"
  options={{ href: null }}
/>
```

`href: null` tells Expo Router to keep the screen accessible via `router.push` but not show it as a tab icon.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/abhinav/tracklist && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/profile/ProfileContent.tsx mobile/app/\(tabs\)/_layout.tsx
git commit -m "fix: mobile listening report navigation — correct push path, hide from tab bar"
```

---

## Done

All four tasks together deliver:
- Web listening report redesigned with stat strip, hero row, grouped list
- Mobile screen created at `/(tabs)/reports/listening` with segmented entity tabs, range bottom sheet, and custom date inputs
- "Full report →" navigation from mobile profile now works
