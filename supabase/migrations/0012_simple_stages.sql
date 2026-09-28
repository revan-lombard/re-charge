-- Re-Charge — six stages, moved by facts instead of memory.
--
--   To contact (prospect, contacted*) → Enquired (new) → Quoted (quote_sent)
--   → Building (in_development) → Live (live), plus Lost (declined).
--   * "contacted" stays as a value so outreach knows who has had an intro;
--     the panel shows it as a badge inside "To contact".
--
-- The old values (under_review, clarification, deposit_paid, approved,
-- client_review, final_payment, care) stay in the enum — Postgres can't drop
-- enum values — but nothing is left on them and the trigger below maps any
-- code path that still writes one (older Edge Functions) onto the six.
--
-- The deposit is paid after the quote is accepted, so:
--   quote page created           → Quoted
--   quote declined online        → Lost (reason copied)
--   quote accepted, not paid yet → stays Quoted (badge "accepted")
--   deposit paid                 → Building
-- Manual (EFT/cash) payments close the matching open payment link, and a care
-- payment moves the client's renewal date on a year.

-- 1. Map existing rows onto the six stages.
update projects set status = 'new'            where status in ('under_review', 'clarification');
update projects set status = 'in_development' where status in ('client_review', 'final_payment');
update projects set status = 'live'           where status = 'care';
update projects set status = case when deposit_paid then 'in_development' else 'quote_sent' end::project_status
  where status = 'approved';
update projects set status = case when quote_cents is not null then 'in_development' else 'new' end::project_status
  where status = 'deposit_paid';

-- Templates that moved a lead to an old stage.
update templates set meta = meta - 'set_status'
  where meta->>'set_status' in ('under_review', 'clarification', 'approved', 'deposit_paid', 'client_review', 'final_payment');
update templates set meta = jsonb_set(meta, '{set_status}', '"live"') where meta->>'set_status' = 'care';

-- 2. One place that decides the stage.
create or replace function projects_normalize_stage() returns trigger
  language plpgsql set search_path = public as $$
begin
  -- legacy values from older code paths
  if new.status in ('under_review', 'clarification') then new.status := 'new'; end if;
  if new.status in ('client_review', 'final_payment') then new.status := 'in_development'; end if;
  if new.status = 'care' then new.status := 'live'; end if;
  if new.status = 'approved' then
    new.status := case when new.deposit_paid then 'in_development' else 'quote_sent' end;
  end if;
  if new.status = 'deposit_paid' then
    new.status := case when new.quote_cents is not null then 'in_development' else 'new' end;
  end if;

  -- facts move a lead forward, never backwards
  if tg_op = 'UPDATE' then
    if new.quote_status = 'sent' and old.quote_status is distinct from 'sent'
       and new.status in ('prospect', 'contacted', 'new') then
      new.status := 'quote_sent';
    end if;
    if new.quote_status = 'declined' and old.quote_status is distinct from 'declined'
       and new.status in ('prospect', 'contacted', 'new', 'quote_sent') then
      new.status := 'declined';
      new.declined_reason := coalesce(nullif(new.declined_reason, ''), nullif(new.quote_decline_reason, ''), 'Declined the quote online');
    end if;
  end if;
  if new.deposit_paid and (tg_op = 'INSERT' or not coalesce(old.deposit_paid, false))
     and (new.status = 'quote_sent' or (new.status in ('prospect', 'contacted', 'new') and new.quote_cents is not null)) then
    new.status := 'in_development';
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_normalize_stage on projects;
create trigger trg_projects_normalize_stage before insert or update on projects
  for each row execute function projects_normalize_stage();

-- The timeline entry for a stage change now fires on any update (a stage can
-- change because quote_status or deposit_paid changed) and uses plain names.
create or replace function stage_label(s text) returns text language sql immutable as $$
  select case s
    when 'prospect' then 'To contact' when 'contacted' then 'Contacted'
    when 'new' then 'Enquired' when 'quote_sent' then 'Quoted'
    when 'in_development' then 'Building' when 'live' then 'Live'
    when 'declined' then 'Lost' else replace(s, '_', ' ') end
$$;
create or replace function projects_status_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into project_events (project_id, kind, note, data)
    values (new.id, 'status',
            stage_label(old.status::text) || ' → ' || stage_label(new.status::text),
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', new.declined_reason,
                               'by', coalesce(auth.uid()::text, 'system')));
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_status_event on projects;
create trigger trg_projects_status_event after update on projects
  for each row execute function projects_status_event();

-- 3. Payments keep the rest in step.
create or replace function payments_side_effects() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  cid uuid := new.client_id;
begin
  if new.status is distinct from 'succeeded' then return new; end if;
  -- only on a new payment, or when an unmatched one gets matched
  if tg_op = 'UPDATE' and (old.project_id is not null or old.client_id is not null) then return new; end if;
  if cid is null and new.project_id is not null then
    select client_id into cid from projects where id = new.project_id;
  end if;

  if new.kind = 'deposit' and new.project_id is not null then
    update projects set deposit_paid = true where id = new.project_id and not deposit_paid;
  end if;

  -- a manual payment settles the matching open link (Yoco closes its own)
  if new.provider <> 'yoco' then
    update payment_requests set status = 'paid', paid_at = coalesce(new.paid_at, now())
    where id = (select id from payment_requests
                where status = 'open' and kind = new.kind and amount_cents = new.amount_cents
                  and ((new.project_id is not null and project_id = new.project_id) or (cid is not null and client_id = cid))
                order by created_at limit 1);
  end if;

  -- a care payment renews the plan for a year: from the renewal date if it's
  -- recent, from today if it lapsed long ago. A plan that renews more than 90
  -- days out is left alone (e.g. the first year was just set up at go-live).
  if new.kind = 'care' and cid is not null then
    update clients set care_active = true,
      care_renews_at = ((case when care_renews_at is null or care_renews_at < current_date - 60
                              then current_date else care_renews_at end) + interval '1 year')::date
    where id = cid and (care_renews_at is null or care_renews_at <= current_date + 90);
  end if;
  return new;
end $$;
drop trigger if exists trg_payments_side_effects on payments;
create trigger trg_payments_side_effects after insert or update of project_id, client_id on payments
  for each row execute function payments_side_effects();

-- 4. Ready-made messages: the panel now refuses to send text still containing
--    a [placeholder], and the deposit is paid on the quote page. Update the
--    starter wording where it hasn't been changed.
update templates set body = E'Hi {{first_name}},\n\nThanks for the chat. Here''s your fixed quote for {{business}}:\n\n{{quote_items}}\n\nTotal: {{quote}}\n\nSee the details and accept it here: {{quote_link}}\n\nWhen you accept, you pay the R500 deposit by card and it comes off the total. The balance is due when your site is finished. Third-party costs like domains are always agreed with you first.\n\nAny questions, just reply.\n\n{{signature}}'
  where kind = 'email' and name = 'Quote' and body like '%[what we''ll build, in plain words]%';
update templates set body = replace(body,
    'noticed [you don''t have a website / your site is hard to use on a phone / bookings run over WhatsApp].',
    'had an idea for you: {{opportunity}}.')
  where kind = 'email' and name = 'Cold outreach';
update templates set body = replace(body,
    'noticed [you don''t have a website yet / your site is hard to use on a phone].',
    'had an idea for you: {{opportunity}}.')
  where kind = 'whatsapp' and name = 'Cold intro';
update templates set body = replace(body,
    'If you''d like to go ahead, the R500 deposit reserves your slot: {{deposit_link}}',
    'If you''d like to go ahead, you can accept the quote and pay the R500 deposit here: {{quote_link}}')
  where kind = 'email' and name = 'Deposit reminder';
