# Known Issues / Weaknesses

## Ingestion

- Not real-time (cron-based delays)
- Risk of duplicate logs from overlapping syncs
- Possible missed listens if Last.fm API fails

## Enrichment

- Spotify rate limits create backlog
- Some tracks never resolve cleanly
- Featured artists / naming mismatches reduce accuracy

## Feed

- Delayed appearance of listens (ingestion lag)
- Reordering when enrichment updates occur
- Potential inconsistency across clients

## Data Quality

- Synthetic `lfm:*` entities fragment identity
- Incorrect mappings can pollute aggregates
- Missing metadata for unresolved tracks

## Dependency Risk

- Heavy reliance on Last.fm API reliability
- Heavy reliance on Spotify for enrichment

## UX Risks

- Users may not understand delays
- Feels “laggy” compared to real-time apps
- Cold start still exists (new users with little history)

## Infra

- Without Redis:
  - No shared rate limiting
  - No shared cache
- Cron scaling issues as user count grows
