// project-intake — receives a submission from the website Project Builder and
// stores it as a project record, then emails a notification.
//
// The website posts the same JSON it currently sends to Formspree. To switch
// the site over, set ENQUIRY_ENDPOINT in config.js to this function's URL:
//   https://<project-ref>.supabase.co/functions/v1/project-intake
// Deploy public (no JWT): see supabase/config.toml.
//
// Untested against a live project — deploy and verify.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";

// keys we store as first-class columns; everything else goes into details jsonb
const TOP = new Set([
  "name", "email", "phone", "business", "category", "goal", "budget",
  "deadline", "indicativePrice", "channel", "type", "page", "_subject",
  "submittedAt", "attachments", "_gotcha",
]);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  // honeypot — silently accept and discard bots
  if (body._gotcha) return json({ ok: true });

  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!TOP.has(k)) details[k] = v;
  }
  const category = String(body.category ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const row = {
    name: str(body.name),
    email: str(body.email),
    phone: str(body.phone),
    business: str(body.business),
    category,
    goal: str(body.goal),
    details,
    budget: str(body.budget),
    deadline: str(body.deadline),
    indicative_price: str(body.indicativePrice),
    channel: str(body.channel),
    status: "new",
  };

  try {
    const db = serviceClient();
    const { data, error } = await db.from("projects").insert(row).select("id, ref").single();
    if (error) throw error;
    await db.from("project_events").insert({
      project_id: data.id, kind: "created", note: "Submitted from website",
      data: { attachments: body.attachments ?? null, page: body.page ?? null },
    });
    await notifyEmail(
      `New project ${data.ref}: ${row.category.join(", ") || "enquiry"} — ${row.name ?? ""}`,
      [
        `Ref: ${data.ref}`,
        `Name: ${row.name ?? ""}`,
        `Email: ${row.email ?? ""}`,
        `Phone: ${row.phone ?? ""}`,
        `Business: ${row.business ?? ""}`,
        `Category: ${row.category.join(", ")}`,
        `Budget: ${row.budget ?? ""}`,
        `Indicative: ${row.indicative_price ?? ""}`,
        `Deadline: ${row.deadline ?? ""}`,
        "",
        `Goal:\n${row.goal ?? ""}`,
        "",
        `Attachments: ${body.attachments ?? "none"}`,
      ].join("\n"),
    );
    return json({ ok: true, id: data.id, ref: data.ref });
  } catch (e) {
    console.error("intake failed:", e);
    return json({ ok: false, error: "could not store project" }, 500);
  }
});

function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}
