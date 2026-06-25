-- Raise statement_timeout for service_role so PostgREST admin calls aren't
-- capped at the authenticator role's 8s limit.
--
-- When PostgREST executes SET ROLE service_role, PostgreSQL applies this
-- rolconfig, overriding the authenticator session's 8s default.
-- This lets repair/drain RPC functions (which take 10-30s) complete
-- without a 57014 cancellation.
ALTER ROLE service_role SET statement_timeout = '30s';
