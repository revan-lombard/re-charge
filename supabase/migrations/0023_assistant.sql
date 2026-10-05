-- Re-Charge — the public AI assistant on the website (functions/assistant).
--
-- The assistant endpoint is public (anyone on the site can ask it something) and
-- every call costs money at Anthropic, so it needs a rate limit. This table is the
-- counter: one row per answered question, keyed by a hash of the asker's IP (never
-- the IP itself, so there's nothing personal stored). The function counts recent
-- rows per hash and in total, refuses politely when either cap is hit, and
-- opportunistically deletes rows older than two days so the table stays tiny.

create table if not exists assistant_hits (
  id         bigserial primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists assistant_hits_ip_time on assistant_hits (ip_hash, created_at desc);
create index if not exists assistant_hits_time    on assistant_hits (created_at desc);

-- Only the service role (the Edge Function) touches this; no client ever reads it.
alter table assistant_hits enable row level security;
