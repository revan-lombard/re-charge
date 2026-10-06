# The Re-Charge Method

How Re-Charge finds, builds and runs AI systems that improve specific business processes,
and how it charges for that. This is the company's IP: the website, the panel, the quotes
and the site assistant all follow this document. Change it here first.

## 1. Position

**Find the work your employees shouldn't be doing.**

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

Implementation is a defined scope at a fixed price. Operations is a monthly fee with a
defined SLA. Everything else is priced separately so the scope never drifts silently.

### Implementation

| Engagement | Price | What it is |
|---|---|---|
| Process review call | Free, 30 min | We hear the problem and say honestly whether AI is the answer. |
| Discovery & opportunity map | **R7,500** fixed, 1–2 weeks | Phases 1–2: process map, baseline, scored opportunities, ROI estimate, recommended first build. Credited in full against implementation if you go ahead within 60 days. |
| Proof of concept | **from R18,500**, 2–4 weeks | Phases 3–4: the smallest useful version on real work, measured before vs after. |
| Production implementation | **from R45,000**, fixed quote | Phases 5–6: integrated with your software, documented, staff trained. |

Deposit: 40% to start (minimum R500), balance on completion.

### Operations (monthly)

Starts at go-live, 3-month minimum, then month to month. Includes monitoring, model/API
costs up to the allowance, maintenance, security updates, usage monitoring, evaluation,
the monthly ROI report, support to the SLA, and hours for workflow optimisation and small
integrations.

| | **Operate** | **Optimise** | **Partner** |
|---|---|---|---|
| Price | **R4,500 / month** | **R9,500 / month** | **R18,500 / month** |
| Systems covered | 1 | up to 3 | all in the agreement |
| Model/API costs included | up to R750 | up to R2,500 | up to R6,000 |
| Optimisation & integration hours | 1 h | 4 h | 10 h |
| Evaluation (accuracy test set) | quarterly | monthly | monthly |
| ROI report | monthly | monthly | monthly + review call |
| Support response (business hours) | next business day | 4 business hours | 2 business hours; critical 1 hour |
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
| Change requests (beyond plan hours) | R850 / hour, quoted before work starts |
| New functionality | A separate project with its own fixed quote |
| Consulting & workshops | R1,250 / hour · half-day workshop R4,500 |
| Emergency support (outside SLA hours) | R1,650 / hour, 1-hour minimum |

### Websites

Still offered, as a separate line (from R1,000, Hosting/Care plans unchanged). They are
not the headline; the AI work is.

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
