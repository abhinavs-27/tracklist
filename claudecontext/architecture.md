# Architecture

## Core System Flow

- Last.fm API (source of truth for listens)
  → Ingestion pipeline (cron + on-demand sync)
  → Supabase (logs, entities, aggregates)
  → Enrichment layer (Spotify resolution)
  → Feed + communities + discovery surfaces
  → Client (Next.js / Expo)

## Key Subsystems

### 1. Ingestion Pipeline (CRITICAL PATH)

- Pulls recent tracks from Last.fm (`user.getRecentTracks`)
- Deduplicates against existing logs
- Writes to `logs`
- Creates synthetic entities (`lfm:*`) if no match exists
- Triggers enrichment jobs

### 2. Enrichment System

- Maps Last.fm tracks → Spotify catalog
- Updates `songs`, `artists`, `albums` with canonical IDs
- Runs async (queue or inline fallback)

### 3. Feed System

- Built from logs + derived events
- Includes:
  - listens (auto-ingested)
  - reviews (optional)
  - follows
  - community activity

### 4. Communities

- Shared feeds derived from member logs
- Weekly charts, consensus rankings, leaderboards

## Critical Design Decisions

- Last.fm is the **source of truth** for listening data
- Logging is **fully passive** (no manual entry required)
- System must handle **eventual consistency** (ingestion + enrichment delays)
- Synthetic IDs (`lfm:*`) are allowed temporarily
- Redis is optional but improves coordination

## Scaling Assumptions

- High write volume from ingestion (per active user)
- Feed reads dominate after ingestion
- Enrichment is bursty and API-bound (Spotify rate limits)
- Cron jobs scale with number of users

## Known Weak Points

- Ingestion lag (cron frequency vs real-time expectations)
- Duplicate or missed listens due to Last.fm inconsistencies
- Enrichment backlog (Spotify rate limits)
- Feed inconsistency during async updates
- Heavy reliance on external APIs

## Open Questions

- Should ingestion move from cron → near real-time streaming?
- How to prioritize enrichment under rate limits?
- Should unresolved `lfm:*` entities be hidden or degraded in UX?
- How to backfill or repair missing listens reliably?
