# Database migrations

Apply these in **numeric order** in the Supabase SQL Editor (paste each file and run).

## Setup
- **New project:** Run `001_initial_schema.sql`, then all subsequent files in numeric order.
- **Existing project:** Run only migrations you haven’t applied yet by checking the file numbers.

## Migration Principles
- **Idempotency:** Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible.
- **Safety:** Each migration should be safe to run once and never require a database reset.
- **RLS Enforcement:** New tables must have Row Level Security enabled. Use the `Admin Client` in the application for system-wide operations that need to bypass RLS.

## Key Migration Blocks
- **001-007**: Initial schema and Spotify integration foundation.
- **008-016**: Review system refactoring and feed performance indexing.
- **017-022**: Advanced RPCs for feed activity and user discovery.
- **023-028**: Listen session logic for feed aggregation.
- **029-034**: Engagement features (streaks, reports, notifications, achievements).
- **035-043**: Performance optimizations, materialized views, and user favorite albums.

**Note on RLS (Migration 005):** If using NextAuth with the custom `users` table, ensure your policies correctly target `users(id)`.
