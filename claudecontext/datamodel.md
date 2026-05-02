# Data Model

## Core Tables

- users
- logs (source of truth for listens)
- songs / albums / artists
- communities
- community_feed
- follows
- spotify_tokens

## Log Ingestion Model

Each log:

- user_id
- track name (raw from Last.fm)
- artist name (raw)
- timestamp
- source = `lastfm`
- optional spotify_id (after enrichment)

## Special Cases

- Synthetic entities:
  - `lfm:<hash>` for unresolved tracks/artists
- Logs may exist before canonical IDs are known

## Invariants

- Logs must be **idempotent** (no duplicates from repeated ingestion)
- Each Last.fm event should map to exactly one log
- Logs should eventually resolve to canonical entities (if possible)

## Known Data Risks

- Duplicate ingestion due to overlapping sync windows
- Missing listens if cron fails or API errors
- Incorrect mappings during enrichment
- Partial data (logs without Spotify IDs)
- Timezone inconsistencies from Last.fm timestamps

## Consistency Model

- Eventual consistency:
  - Logs → immediate
  - Enrichment → delayed
  - Aggregates → delayed

## Open Questions

- Best deduplication key? (timestamp + track + artist?)
- Should logs be immutable after creation?
- How to handle edits/corrections from Last.fm?
- How to reprocess historical data safely?
