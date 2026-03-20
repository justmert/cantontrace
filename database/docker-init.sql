-- CantonTrace: Docker initialization script
-- This file is mounted as /docker-entrypoint-initdb.d/00-init.sql
-- and runs automatically on first container startup (when the data volume is empty).
--
-- The migrations/ directory is mounted alongside this file at
-- /docker-entrypoint-initdb.d/migrations/
--
-- PostgreSQL's docker-entrypoint runs .sql files alphabetically from
-- docker-entrypoint-initdb.d/. The "00-" prefix ensures this runs first.
-- We use \i to include migration files in order.

\i /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql
\i /docker-entrypoint-initdb.d/migrations/002_error_knowledge_base.sql
\i /docker-entrypoint-initdb.d/migrations/003_seed_error_categories.sql
\i /docker-entrypoint-initdb.d/migrations/004_seed_error_codes.sql
\i /docker-entrypoint-initdb.d/migrations/005_session_tracking.sql
