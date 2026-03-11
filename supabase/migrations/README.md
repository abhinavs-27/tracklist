# Database migrations

Apply these in **numeric order** in the Supabase SQL Editor (paste each file and run).

- **New project:** run `001_initial_schema.sql`, then `002_audit_indexes.sql`, then any later files.
- **Existing project:** run only migrations you haven’t applied yet.

**Going forward:** all SQL changes go in new migration files (e.g. `003_add_feature.sql`). Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` etc. so each migration is safe to run once and never requires a DB reset.
