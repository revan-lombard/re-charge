// Resolve the calling user (from the Supabase JWT) and which clients they may
// access. Used by functions deployed with verify_jwt = true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serviceClient } from "./db.ts";

export type Caller = { userId: string; isStaff: boolean; clientIds: string[] };

export async function getCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await asUser.auth.getUser();
  if (error || !user) return null;

  // membership/staff read with the service role (avoids RLS recursion)
  const db = serviceClient();
  const [{ data: staff }, { data: memberships }] = await Promise.all([
    db.from("staff").select("user_id").eq("user_id", user.id).maybeSingle(),
    db.from("client_users").select("client_id").eq("user_id", user.id),
  ]);
  return {
    userId: user.id,
    isStaff: Boolean(staff),
    clientIds: (memberships ?? []).map((m: { client_id: string }) => m.client_id),
  };
}

export function canAccess(caller: Caller, clientId: string): boolean {
  return caller.isStaff || caller.clientIds.includes(clientId);
}
