// Reading a payment proof or an invoice: the panel pulls the text out of the PDF or photo in the
// browser (pdf.js / OCR), and this turns it into fields. Runs on the home AI hub first (ai.ts).
import { aiJSON, type Engine } from "./ai.ts";

export const DOC_TYPES = ["payment_proof", "supplier_invoice", "client_invoice", "other"] as const;
export const CATEGORIES = ["hosting", "software", "ai", "marketing", "equipment", "office", "travel", "professional", "other"] as const;
export type ReadDoc = {
  doc_type: typeof DOC_TYPES[number]; party: string; amount: number | null; vat: number | null; currency: string;
  date: string; reference: string; invoice_no: string; description: string; category: typeof CATEGORIES[number];
};

const SYSTEM = `You read one business document for Re-Charge, a small AI and automation studio in Johannesburg, and pull out the facts. A person checks every field before anything is saved.

Decide what it is:
- payment_proof: proof that someone PAID Re-Charge (a bank "proof of payment", EFT notification, deposit slip, payment confirmation) where Re-Charge is the beneficiary or recipient
- supplier_invoice: a bill, invoice, receipt or statement Re-Charge must pay or has paid TO a supplier (hosting, software, subscriptions, AI usage, equipment, services)
- client_invoice: an invoice FROM Re-Charge to a client
- other: anything else

Answer with ONE JSON object and nothing else:
{"doc_type": "...", "party": "...", "amount": 0.00, "vat": null, "currency": "ZAR", "date": "YYYY-MM-DD", "reference": "...", "invoice_no": "...", "description": "...", "category": "..."}

- party: for a payment_proof, who paid (the payer's name or business); for a supplier_invoice, the supplier; for a client_invoice, the client.
- amount: the total paid or due, as a number in rands (or the currency shown), VAT included. null if you can't find it.
- vat: the VAT amount if shown, else null.
- currency: ZAR unless another currency is clearly shown (USD, EUR, GBP).
- date: the payment or invoice date as YYYY-MM-DD. Empty string if none.
- reference: the payment reference or "beneficiary reference" (often an RC-00000 number, a name or an invoice number). Empty if none.
- invoice_no: the invoice or receipt number. Empty if none.
- description: at most 12 words on what it is for.
- category (for supplier invoices; "other" otherwise): hosting, software, ai, marketing, equipment, office, travel, professional, other.
Copy numbers and names exactly as they appear. Never guess a number that isn't in the text.`;

export async function readDocument(text: string, preferClaude = false): Promise<{ doc: ReadDoc; engine: Engine; ms: number }> {
  const r = await aiJSON<ReadDoc>("read-doc", SYSTEM, `The document's text:\n<doc>\n${String(text).slice(0, 8000)}\n</doc>`, {
    maxTokens: 400, preferClaude,
    check: (x) => Boolean(x && DOC_TYPES.includes(x.doc_type)),
  });
  const x = r.data;
  const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? String(x.date) : "";
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  return { ...r, doc: {
    doc_type: x.doc_type, party: s(x.party, 120), amount: num(x.amount), vat: num(x.vat), currency: /^(ZAR|USD|EUR|GBP)$/.test(String(x.currency)) ? String(x.currency) : "ZAR",
    date, reference: s(x.reference, 80), invoice_no: s(x.invoice_no, 60), description: s(x.description, 140),
    category: CATEGORIES.includes(x.category) ? x.category : "other",
  } };
}
