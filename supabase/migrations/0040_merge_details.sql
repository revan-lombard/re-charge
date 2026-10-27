-- 0040: change a lead's details in one step (ADMIN.md 8dk). Safe to run twice.
-- details is one JSON column that the panel, the trial page (trial-pay) and the payment webhook all
-- write to. Reading it, changing it and writing it back could undo what another wrote in between (a
-- client pressing Keep it while you send a message). This merges only the given keys, in the database,
-- in one statement. A key set to null is removed.
create or replace function merge_project_details(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or is_staff()) then
    raise exception 'not allowed';
  end if;
  update projects
     set details = (coalesce(details, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb))
                   - coalesce(array(select key from jsonb_each(coalesce(p_patch, '{}'::jsonb)) where value = 'null'::jsonb), '{}'::text[])
   where id = p_id
  returning details into out;
  if out is null then raise exception 'lead not found'; end if;
  return out;
end $$;
revoke all on function merge_project_details(uuid, jsonb) from public, anon;
grant execute on function merge_project_details(uuid, jsonb) to authenticated, service_role;
