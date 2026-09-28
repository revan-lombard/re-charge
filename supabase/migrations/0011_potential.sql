-- Re-Charge — how promising a lead is for us, and the website they have now.
-- potential: your own rating when you research a prospect (🟢 very high / high,
-- 🟡 medium, 🔴 low); potential_note: the opportunity in a few words
-- ("new website + quote system"). website: their current site, if any.
alter table projects add column if not exists potential      text
  check (potential in ('very_high','high','medium','low'));
alter table projects add column if not exists potential_note text;
alter table projects add column if not exists website        text;
create index if not exists projects_potential_idx on projects (potential) where potential is not null;
