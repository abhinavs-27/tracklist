-- 013_reviews_disable_rls.sql
-- This app uses NextAuth for authentication, not Supabase Auth.
-- auth.uid() is always NULL, so the existing RLS policies block all writes.
-- Auth is enforced at the API route level. Disable RLS to be consistent
-- with every other table (logs, follows, likes, comments).

DROP POLICY IF EXISTS "reviews_select_all" ON reviews;
DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON reviews;
DROP POLICY IF EXISTS "reviews_delete_own" ON reviews;

ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;
