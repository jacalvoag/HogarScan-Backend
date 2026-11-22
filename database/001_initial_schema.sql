SET client_encoding = 'UTF8';

BEGIN;

SET LOCAL TIME ZONE 'UTC';

CREATE TABLE public.users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary_generation integer NOT NULL DEFAULT 0,

    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),

    CONSTRAINT users_email_check CHECK (
        char_length(email) >= 3
        AND email = lower(email)
        AND email !~ '[[:space:]]'
    ),

    CONSTRAINT users_password_hash_check CHECK (
        password_hash LIKE '$argon2id$%'
    ),

    CONSTRAINT users_created_at_check CHECK (
        isfinite(created_at)
    ),

    CONSTRAINT users_summary_generation_check CHECK (
        summary_generation >= 0
    )
);

CREATE TABLE public.sessions (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz(3) NOT NULL,
    revoked_at timestamptz(3),

    CONSTRAINT sessions_pkey PRIMARY KEY (token_hash),

    CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id)
        ON DELETE CASCADE,

    CONSTRAINT sessions_token_hash_check CHECK (
        char_length(token_hash) = 64
        AND token_hash ~ '^[0-9a-f]{64}$'
    ),

    CONSTRAINT sessions_dates_check CHECK (
        isfinite(created_at)
        AND isfinite(expires_at)
        AND expires_at > created_at
        AND (
            revoked_at IS NULL
            OR (
                isfinite(revoked_at)
                AND revoked_at >= created_at
            )
        )
    )
);

CREATE INDEX sessions_user_id_idx
    ON public.sessions (user_id);

CREATE TABLE public.scan_summaries (
    user_id uuid NOT NULL,
    scan_id uuid NOT NULL,
    summary_generation integer NOT NULL,

    started_at timestamptz(3) NOT NULL,
    finished_at timestamptz(3) NOT NULL,
    received_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    addresses_scanned integer NOT NULL,
    addresses_responded integer NOT NULL,
    accepted_services integer NOT NULL,

    tcp_service_accessible integer NOT NULL,
    protocol_identified integer NOT NULL,
    preventive_review integer NOT NULL,
    possible_cve_match integer NOT NULL,
    insufficient_evidence integer NOT NULL,

    CONSTRAINT scan_summaries_pkey
        PRIMARY KEY (user_id, scan_id),

    CONSTRAINT scan_summaries_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id)
        ON DELETE CASCADE,

    CONSTRAINT scan_summaries_generation_check CHECK (
        summary_generation >= 0
    ),

    -- El reloj del teléfono puede retroceder durante una revisión.
    CONSTRAINT scan_summaries_dates_check CHECK (
        isfinite(started_at)
        AND isfinite(finished_at)
        AND isfinite(received_at)
    ),

    CONSTRAINT scan_summaries_addresses_check CHECK (
        addresses_scanned BETWEEN 1 AND 254
        AND addresses_responded BETWEEN 0 AND addresses_scanned
        AND accepted_services BETWEEN 0 AND 1524
        AND accepted_services <= addresses_responded * 6
    ),

    CONSTRAINT scan_summaries_findings_check CHECK (
        tcp_service_accessible BETWEEN 0 AND 100000
        AND protocol_identified BETWEEN 0 AND 100000
        AND preventive_review BETWEEN 0 AND 100000
        AND possible_cve_match BETWEEN 0 AND 100000
        AND insufficient_evidence BETWEEN 0 AND 100000
    )
);

CREATE INDEX scan_summaries_recent_idx
    ON public.scan_summaries (
        user_id,
        summary_generation,
        started_at DESC,
        scan_id DESC
    );

CREATE FUNCTION public.reject_scan_summary_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'Los resúmenes congelados no admiten modificaciones.'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER scan_summaries_immutable
BEFORE UPDATE ON public.scan_summaries
FOR EACH ROW
EXECUTE FUNCTION public.reject_scan_summary_update();

CREATE VIEW public.user_statistics AS
SELECT
    u.id AS user_id,
    u.summary_generation,
    count(s.scan_id) AS total_scans,

    coalesce(
        sum(s.addresses_scanned), 0::bigint
    ) AS total_addresses_scanned,

    coalesce(
        sum(s.addresses_responded), 0::bigint
    ) AS total_addresses_responded,

    coalesce(
        sum(s.accepted_services), 0::bigint
    ) AS total_accepted_services,

    jsonb_build_object(
        'TCP_SERVICE_ACCESSIBLE',
        coalesce(sum(s.tcp_service_accessible), 0::bigint),

        'PROTOCOL_IDENTIFIED',
        coalesce(sum(s.protocol_identified), 0::bigint),

        'PREVENTIVE_REVIEW',
        coalesce(sum(s.preventive_review), 0::bigint),

        'POSSIBLE_CVE_MATCH',
        coalesce(sum(s.possible_cve_match), 0::bigint),

        'INSUFFICIENT_EVIDENCE',
        coalesce(sum(s.insufficient_evidence), 0::bigint)
    ) AS findings_by_category

FROM public.users AS u
LEFT JOIN public.scan_summaries AS s
    ON s.user_id = u.id
    AND s.summary_generation = u.summary_generation

GROUP BY u.id, u.summary_generation;

COMMIT;