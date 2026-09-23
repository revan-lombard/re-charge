-- Re-Charge admin — Phase B (comms)
-- A template can carry behaviour: what to set on the project after it is
-- sent (next action + due-in days, and optionally a stage to move to).
-- Example: {"next_action":"Follow-up 1","next_days":3,"set_status":"contacted"}
alter table templates add column if not exists meta jsonb not null default '{}'::jsonb;
alter table messages  add column if not exists meta jsonb not null default '{}'::jsonb;  -- provider events, error text
create index if not exists messages_provider_idx on messages (provider_id) where provider_id is not null;
