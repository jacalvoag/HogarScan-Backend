BEGIN;

CREATE ROLE hogarscan_api
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE hogarscan TO hogarscan_api;
GRANT USAGE ON SCHEMA public TO hogarscan_api;

GRANT SELECT, INSERT
    ON public.users
    TO hogarscan_api;

GRANT UPDATE (summary_generation)
    ON public.users
    TO hogarscan_api;

GRANT SELECT, INSERT
    ON public.sessions
    TO hogarscan_api;

GRANT UPDATE (revoked_at)
    ON public.sessions
    TO hogarscan_api;

GRANT SELECT, INSERT, DELETE
    ON public.scan_summaries
    TO hogarscan_api;

GRANT SELECT
    ON public.user_statistics
    TO hogarscan_api;

COMMIT;