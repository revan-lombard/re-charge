# The Re-Charge Method

How Re-Charge finds, builds and runs AI systems that improve specific business processes,
and how it charges for that. This is the company's IP: the website, the panel, the quotes
and the site assistant all follow this document. Change it here first.

## 1. Position

**Your business shouldn't have to work this hard.** (Homepage headline from 2026-10-09; for
larger AI process work we still say: find the work your employees shouldn't be doing.)

We design and implement AI systems that automate repetitive business processes, connect
your existing software and give your teams better access to the information they already
have.

We sell outcomes, not AI. Nobody buys "a RAG system" or "an agent"; they buy back the
hours their staff spend on enquiries, searching documents, retyping data and chasing
paperwork. The model underneath is a part we choose and can swap. Our moat sits above
the models: the method, the measured results, the industry knowledge each job adds,
and the reusable systems that make the next job faster.

### Words we use and don't use

| Say | Don't say |
|---|---|
| "Reduce the time staff spend processing enquiries" | "Transform your business with cutting-edge AI" |
| "Turn the documents your staff search for into one knowledge base" | "RAG", "agents", "LLM" (on the site; fine in a scoping doc) |
| "Measured before and after" | "Revolutionary", "game-changing", "unlock" |
| A number with its unit and how it was measured | A number without a source |

### Every offer is written as Problem → Solution → Result

- **Problem**: what staff do now, in hours or minutes, in the client's words.
- **Solution**: what the system does, step by step, in plain language.
- **Result**: the measured change, with the before and after on the same definition.

Until a result is measured on a real client, it is labelled as an **example** or a
**target**, never presented as a case study.

## 2. The framework (7 phases)

| # | Phase | What happens | Output |
|---|---|---|---|
| 1 | **Discovery** | Map the people, processes, software, data, bottlenecks, repetitive work and decision points. Measure the baseline. | Process map + baseline numbers |
| 2 | **Opportunity mapping** | Score every opportunity found (below) and rank them. | Scored opportunity map + recommended first build |
| 3 | **Proof of concept** | Build the smallest useful version on real work. | Working PoC, used by real staff |
| 4 | **ROI validation** | Measure before vs after on the same definition. Go / adjust / stop. | ROI result |
| 5 | **Production** | Integrate properly: permissions, logging, error handling, the client's real software. | Production system + runbook |
| 6 | **Adoption** | Train the people who use it; adjust to how they actually work. | Trained team, usage tracked |
| 7 | **Optimisation** | Monitor, evaluate, improve, report monthly. | Monthly ROI report |

Phases 1–2 are the Discovery engagement. Phases 3–6 are Implementation. Phase 7 is
Operations. A job can stop honestly at phase 2 or phase 4 — that is a feature: we only
take to production what has proved its value.

## 3. Opportunity scoring

Each opportunity found in discovery is scored 0–10 on six factors:

| Factor | Question | Direction |
|---|---|---|
| Time saved | How many staff hours a month does it take back? | higher is better |
| Revenue potential | Does it win, keep or speed up revenue? | higher is better |
| Implementation difficulty | How hard is it to build and integrate? | higher is **worse** |
| Data availability | Is the information it needs available, digital and clean enough? | higher is better |
| Risk | What happens when it is wrong (money, legal, reputation, privacy)? | higher is **worse** |
| Employee adoption | Will the people who do the work actually use it? | higher is better |

**Opportunity score (0–100)**

```
score = 2.5·Time + 1.5·Revenue + 1.5·Data + 1.5·Adoption + 1.5·(10 − Difficulty) + 1.5·(10 − Risk)
```

(The weights sum to 10, so a perfect 10 everywhere scores 100. Time saved weighs most
because it is what we measure and report.)

**Gates** — regardless of the score:
- Data availability ≤ 3 → "Fix the data first" (not buildable yet).
- Risk ≥ 8 → "Human in the loop only": the system prepares, a person approves.

**Ranking**: 70+ build first · 50–69 next in line · below 50 park.

The same formula runs in the panel (`admin/admin.js`, `oppScore`) and on the public
Method page (`script.js`, `oppScore`). Keep the three in step.

## 4. Measuring ROI (obsessively)

1. **Baseline before anything is built** (phase 1): the metric, its unit, the volume, how
   it was measured and over what period (at least 2 weeks or 30 items). The panel will not
   move a job into development without one.
2. **After**, on the same definition, for at least 2 weeks after go-live.
3. **Value in Rands**:
   - Hours saved a month = (minutes before − minutes after) × items a month ÷ 60
   - Rand value a month = hours saved × loaded hourly cost
     (loaded hourly cost ≈ monthly salary × 1.3 ÷ 173, or the client's own figure)
   - Payback (months) = implementation fee ÷ (monthly value − operations fee)
4. Revenue effects (faster replies → more bookings) are reported separately and only when
   measured; they are never quietly added to the hours figure.
5. Every month the client gets a report that leads with the result, then usage, then what
   we changed.

## 5. Commercial model

Two tiers (decided 2026-10-09; repriced 2026-10-11 for mid-size and international clients,
with no small-business tier):

1. **Fixed-scope builds** for focused problems, shown first everywhere (homepage, pricing):
   business websites from R12,500, platforms/web apps from R35,000, dashboards from R15,000,
   automations from R15,000, AI solutions from R25,000, custom software from R45,000.
   Starting prices buy the simplest useful version; the fixed proposal sets the real scope
   and price before development. Ongoing costs (managed hosting R450/month, Care
   R1,450/month, subscriptions and AI usage at cost, support from R7,500/month) are listed
   in the proposal. Outside South Africa we quote in USD, EUR or GBP from a fixed list
   (decided 2026-10-12): USD = the rand price ÷ 10, EUR ≈ USD × 0.92 and GBP ≈ USD × 0.8,
   rounded. Not a live exchange rate; review it once or twice a year. The site picks the
   currency from the visitor's time zone, with a switch. International clients pay larger
   invoices by bank transfer to a foreign-currency account and monthly fees by card
   (Paystack). Exported services are usually zero-rated for VAT: confirm with the accountant.
2. **Larger AI process work** (automating a whole process across systems): the staged model
   below. The free process review / problem enquiry decides which tier a job belongs to.

Website messaging follows the strategy "educate first, demonstrate the possibility, sell the
solution": start from the visitor's problem in plain language, never lead with technology,
and say so when the right answer is a website, a simple automation or a dashboard rather
than AI.


Implementation is a defined scope at a fixed price. Operations is a monthly fee with a
defined SLA. Everything else is priced separately so the scope never drifts silently.

### Implementation

| Engagement | Price | What it is |
|---|---|---|
| Process review call | Free, 30 min | We hear the problem and say honestly whether AI is the answer. |
| Discovery & opportunity map | **R15,000** fixed, 1–2 weeks | Phases 1–2: process map, baseline, scored opportunities, ROI estimate, recommended first build. Credited in full against implementation if you go ahead within 60 days. |
| Proof of concept | **from R35,000**, 2–4 weeks | Phases 3–4: the smallest useful version on real work, measured before vs after. **Guarantee:** one target agreed in writing first; if missed, 50% of the Prove fee is refunded (terms §: The Prove guarantee). |
| Production implementation | **from R85,000**, fixed quote | Phases 5–6: integrated with your software, documented, staff trained. |

Deposit: 40% to start, balance on completion.

### Operations (monthly)

Starts at go-live, 3-month minimum, then month to month. Includes monitoring, model/API
costs up to the allowance, maintenance, security updates, usage monitoring, evaluation,
the monthly ROI report, support to the SLA, and hours for workflow optimisation and small
integrations.

| | **Operate** | **Optimise** | **Partner** |
|---|---|---|---|
| Price | **R7,500 / month** | **R15,000 / month** | **R35,000 / month** |
| Systems covered | 1 | up to 3 | all in the agreement |
| Model/API costs included | up to R1,500 | up to R4,000 | up to R10,000 |
| Optimisation & integration hours | 2 h | 6 h | 15 h |
| Evaluation (accuracy test set) | quarterly | monthly | monthly |
| ROI report | monthly | monthly | monthly + review call |
| Support response, critical (business hours) | next business day | same business day | 4 business hours |
| Roadmap review | — | quarterly | monthly |

Model/API use above the allowance is billed at cost; we warn at 80%. Unused hours don't
roll over (Partner: one month).

### SLA definitions

- **Business hours**: Monday–Friday 08:00–17:00 SAST, excluding public holidays.
- **Critical**: the system is down or producing wrong outputs at scale. **High**: a part
  is failing, with a workaround. **Normal**: questions, small issues, requests.
- Response time is the time to a human acknowledgement with a first assessment, not to
  a fix. We monitor third-party models but cannot guarantee their uptime; we can and do
  guarantee how fast we respond and that we fall back safely.

### Priced separately

| | Rate |
|---|---|
| Change requests (beyond plan hours) | R1,250 / hour, quoted before work starts |
| New functionality | A separate project with its own fixed quote |
| Consulting & workshops | R1,850 / hour · half-day workshop R7,500 |
| Emergency support (outside SLA hours) | R2,450 / hour, 1-hour minimum |

### Websites

Business websites from R12,500; platforms from R35,000. No one-page sites, pay-monthly
websites or Google profile setup any more; existing clients keep what they signed up for.

## 6. The flywheel (why this stays profitable)

```
client → discovery → AI solution → implementation → measured ROI → case study
  → industry knowledge → reusable system → faster delivery → lower cost
  → better margins → more clients → more data → better system ↺
```

What this means in practice:
- **Every job leaves something reusable**: a prompt set, an evaluation set, an
  integration, a process map template for that industry. Store it under the industry.
- **Every measured result becomes a case study** (with the client's permission) on the
  Solutions page, replacing an example.
- **Price on value, deliver on reuse**: the second law firm's enquiry system costs us a
  fraction of the first; the price stays tied to the result.
- Without reuse, every job is bespoke and the margin disappears.
