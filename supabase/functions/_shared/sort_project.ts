// Sort one lead's enquiry and save the result on the lead (projects.ai_sort).
// Called by project-intake for every new website enquiry (in the background), and by ai-hub "resort".
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sortMessage } from "./sort.ts";
import { hubConfigured, claudeConfigured } from "./ai.ts";

export async function sortProject(db: SupabaseClient, projectId: string) {
  if (!hubConfigured() && !claudeConfigured()) return null;       // no AI set up: nothing to do
  const { data: p } = await db.from("projects").select("id, name, business, email, phone, location, goal, category, details").eq("id", projectId).maybeSingle();
  if (!p) throw new Error("lead not found");
  const d = (p.details || {}) as Record<string, unknown>;
  const extra = Object.entries(d).filter(([k, v]) => !k.startsWith("_") && v != null && typeof v !== "object" && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
  const text = [`Form: ${d.formType || (p.category || []).join(", ")}`, `From: ${[p.name, p.business, p.email, p.phone, p.location].filter(Boolean).join(" · ")}`, "", String(p.goal || ""), extra].join("\n");
  const r = await sortMessage(text, "website form");
  const ai_sort = { ...r.sorted, engine: r.engine, at: new Date().toISOString() };
  await db.from("projects").update({ ai_sort }).eq("id", projectId);
  return ai_sort;
}
