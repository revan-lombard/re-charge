-- 0036: the office PC answers people before background work (ADMIN.md 8dd).
-- The PC answers one job at a time. Before this, jobs went strictly oldest first, so a client
-- pasting an email could wait behind a demo being built or a Microsoft 365 run and time out.
-- Now jobs someone is waiting for (a client's reply or summary, the website chat, the panel) go
-- first; the demo builder and the Microsoft 365 drafts take what's left. Safe to run twice.
create or replace function claim_ai_request() returns setof ai_requests
language sql security definer set search_path = public as $$
  update ai_requests set status = 'working', claimed_at = now()
  where id = (select id from ai_requests where status = 'queued' and expires_at > now() + interval '5 seconds'
              order by (task in ('live-demo', 'inbox-auto-draft'))::int, created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function claim_ai_request() from public, anon, authenticated;
grant execute on function claim_ai_request() to service_role;
