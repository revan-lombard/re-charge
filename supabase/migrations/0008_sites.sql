-- Re-Charge admin — Sites: everything built onto the domain (demos, mockups,
-- client previews) and client sites hosted elsewhere. Publishing writes files
-- to the GitHub Pages repo under previews/<slug>/ via the publish-site function.
create table if not exists sites (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique not null,                 -- previews/<slug>/
  kind           text not null default 'mockup' check (kind in ('demo','mockup','preview','client_site','other')),
  status         text not null default 'draft' check (status in ('draft','published','unpublished','archived')),
  listed         boolean not null default false,       -- show on the public demos page (future)
  url            text,                                 -- live URL (on-domain preview or external client site)
  project_id     uuid references projects(id) on delete set null,
  client_id      uuid references clients(id) on delete set null,
  description    text,
  notes          text,
  screenshot_path text,                                -- storage: marketing/sites/...
  files          jsonb not null default '[]'::jsonb,  -- published paths (relative)
  bytes          integer not null default 0,
  commit_sha     text,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table sites enable row level security;
drop policy if exists sites_staff on sites;
create policy sites_staff on sites for all using (is_staff()) with check (is_staff());
