// Create a Yoco hosted checkout. Returns { id, redirectUrl } or throws.
export async function createYocoCheckout(opts: {
  amountCents: number; metadata: Record<string, string>; successUrl: string; cancelUrl: string;
}): Promise<{ id: string; redirectUrl: string }> {
  const secret = Deno.env.get("YOCO_SECRET_KEY");
  if (!secret) throw new Error("payments not configured");
  const res = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: opts.amountCents, currency: "ZAR", metadata: opts.metadata,
      successUrl: opts.successUrl, cancelUrl: opts.cancelUrl, failureUrl: opts.cancelUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.redirectUrl) { console.error("yoco checkout error:", data); throw new Error("checkout failed"); }
  return { id: data.id, redirectUrl: data.redirectUrl };
}
