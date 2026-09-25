-- Re-Charge — tighten what a future client-portal member can see.
-- Staff notes, time logs and internal fields must never reach a client login.
-- (No client_users rows exist yet; this closes the gap before the portal does.)
drop policy if exists project_events_read on project_events;
create policy project_events_read on project_events for select
  using (
    is_staff()
    or (kind in ('created','status','payment') and exists (
      select 1 from projects p where p.id = project_id
        and p.client_id is not null and is_member(p.client_id)))
  );
