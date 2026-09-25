-- Re-Charge — automatic mockup builds.
-- A lead (usually a free-mockup request) can be queued; a scheduled Claude
-- session picks queued briefs up through the build-queue function, builds a
-- static mockup into previews/<slug>/, and reports back. The human reviews
-- and sends the "Mockup ready" email — nothing is sent automatically.
alter table projects add column if not exists build_status text not null default 'none'
  check (build_status in ('none','queued','building','built','reviewed','failed'));
alter table projects add column if not exists build_brief   jsonb;          -- snapshot of what the builder was told
alter table projects add column if not exists build_log     text;           -- builder's notes / error
alter table projects add column if not exists build_site_id uuid references sites(id) on delete set null;
alter table projects add column if not exists build_started_at timestamptz;
create index if not exists projects_build_status_idx on projects (build_status) where build_status <> 'none';

-- Optional: auto-queue every new free-mockup request (settings.autobuild.auto_queue = true).
create or replace function projects_autoqueue() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if new.details->>'formType' = 'Free mockup request' and new.spam = false then
    select value into v from settings where key = 'autobuild';
    if coalesce((v->>'auto_queue')::boolean, false) then
      new.build_status := 'queued';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_autoqueue on projects;
create trigger trg_projects_autoqueue before insert on projects
  for each row execute function projects_autoqueue();
