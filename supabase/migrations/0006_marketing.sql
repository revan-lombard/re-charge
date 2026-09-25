-- Re-Charge admin — marketing (campaigns, posts, attribution, post images)
-- Additive only. Attribution needs no schema: the website stores ?src=<code>
-- in projects.channel; a campaign's `code` is that value.

create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text unique not null,          -- the ?src= value, e.g. fb-durban-salons
  goal          text,
  audience      text,
  channels      text[] not null default '{}',
  status        text not null default 'planned' check (status in ('planned','active','paused','done')),
  starts_on     date,
  ends_on       date,
  budget_cents  integer,
  spend_cents   integer not null default 0,
  reach         integer,
  clicks        integer,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references campaigns(id) on delete set null,
  title         text not null,
  channel       text not null default 'facebook',   -- facebook | instagram | linkedin | whatsapp | x | tiktok | google | email | other
  body          text not null default '',
  hashtags      text,
  link          text,                               -- the CTA link; ?src=<campaign code> is appended when posting
  image_path    text,                               -- storage object in bucket "marketing"
  status        text not null default 'idea' check (status in ('idea','drafted','scheduled','posted','archived')),
  scheduled_at  timestamptz,
  posted_at     timestamptz,
  post_url      text,
  results       jsonb not null default '{}'::jsonb, -- {reach, likes, comments, clicks}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists posts_scheduled_idx on posts (scheduled_at) where scheduled_at is not null;
create index if not exists projects_channel_idx on projects (channel) where channel is not null;

alter table campaigns enable row level security;
alter table posts     enable row level security;
drop policy if exists campaigns_staff on campaigns;
create policy campaigns_staff on campaigns for all using (is_staff()) with check (is_staff());
drop policy if exists posts_staff on posts;
create policy posts_staff on posts for all using (is_staff()) with check (is_staff());

-- private bucket for post images (5 MB per file, images only); staff-only access
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('marketing', 'marketing', false, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
  on conflict (id) do nothing;
drop policy if exists marketing_objects_staff on storage.objects;
create policy marketing_objects_staff on storage.objects for all
  using (bucket_id = 'marketing' and is_staff()) with check (bucket_id = 'marketing' and is_staff());
