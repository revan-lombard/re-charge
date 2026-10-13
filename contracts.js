/* Re-Charge contract templates (2026-10-13).
   One source for the public agreement page (agreement.html) and the panel's
   Contracts library (admin), which fills {{fields}} with the client's details.
   Plain-language templates written without an attorney: have them reviewed
   before relying on them, especially for clients outside South Africa.
   Format: "## " heading, "1.1 " numbered clause, "- " bullet, blank line = paragraph. */
(function (root) {
  'use strict';

  const DOCS = [
    {
      id: 'msa',
      title: 'Client Services Agreement',
      short: 'Services agreement',
      when: 'Once per client, before the first paid work. Every project order and monthly plan sits under it.',
      body: `
This agreement is between {{us}} ({{us_details}}) ("we", "us") and {{client}} ({{client_details}}) ("you"). It covers every piece of work we do for you. The details of each piece of work (what we build, the price and the dates) are set out in a project order or a monthly plan that refers to this agreement.

## 1. How work is agreed
1.1 Before we start any paid work, we send you a written quote or project order with the scope, the price and the timeline.
1.2 You accept it by signing it, or by accepting it online (typing your name and confirming). Either way is binding, and accepting a quote also means you accept this agreement.
1.3 If a project order and this agreement disagree, the project order wins for that project.

## 2. Scope and changes
2.1 We do the work described in the project order, with care and skill, and keep you informed.
2.2 Anything not in the project order is a change. We quote changes before doing them and only start once you approve the quote in writing (email or WhatsApp is fine).
2.3 Small changes on a monthly plan come out of that plan's included hours first.

## 3. Your part
3.1 You give us the information, content, access and decisions the project needs, on time, and a person who can make decisions for you.
3.2 If something we need is late, the dates move by the same amount. If a project is on hold for more than 60 days because we're waiting for you, we may close it and invoice the work done.
3.3 You make sure you have the right to give us any material you send (text, images, data, logos), and that we may use it to do the work.

## 4. Fees and payment
4.1 Prices are in the currency on the quote: South African rand, or US dollars, euros or pounds for clients outside South Africa. Rand prices include VAT where we are VAT-registered; the VAT treatment is shown on each invoice.
4.2 Projects: a 40% deposit when you accept the quote, and the balance as set out in the project order (usually before launch or handover; larger projects can be split into milestones).
4.3 Monthly plans are billed monthly in advance and are due within 7 days of the invoice.
4.4 Third-party costs (for example software subscriptions, domains and AI usage) are listed in the quote and charged at cost, never marked up.
4.5 If an invoice is more than 14 days overdue, we may pause work or the service after giving you 7 days' written notice. We restart as soon as it's paid.
4.6 Bank and card charges on your side are yours.

## 5. Delivery and acceptance
5.1 When we deliver something, you have 10 business days to check it and tell us of anything that doesn't match the project order. We fix those points at no charge.
5.2 It counts as accepted when you approve it, start using it for real work, or 10 business days pass without you reporting a problem.

## 6. Ownership
6.1 Once you've paid in full, you own what we made specifically for you: the code, designs, documents and content, and the data and accounts set up for you.
6.2 We keep ownership of our own tools, templates and know-how that we bring to the work or develop for general use. Where they are part of what we deliver, you get a permanent, royalty-free right to use and change them as part of your system.
6.3 Third-party software and services (for example hosting, AI providers and open-source code) stay under their own licences and terms.
6.4 We may say we worked with you and show finished work in our portfolio, unless you ask us not to. We never publish your confidential information.

## 7. AI systems
7.1 AI can make mistakes. Where a mistake could matter, the system is designed so that a person checks the result before it is used, and the project order says where that applies. You are responsible for those checks and for decisions you make using the system.
7.2 Time savings and results we estimate are estimates, not promises. We measure the real result and report it to you.
7.3 Systems use third-party AI providers, which we tell you about before we build. Where a provider lets us choose, we use settings that stop your data from being used to train its models.
7.4 You use the system lawfully and in line with the providers' acceptable-use rules.

## 8. Confidentiality
8.1 Each of us keeps the other's confidential information private, uses it only for this agreement, and shares it only with people who need it for the work and are bound to keep it private.
8.2 This doesn't apply to information that is public through no fault of the receiver, was already known to them, or must be disclosed by law.
8.3 This clause lasts for 3 years after the agreement ends, and for as long as the information stays a trade secret.

## 9. Personal information
9.1 Each of us follows the Protection of Personal Information Act (POPIA) and, where it applies, the EU or UK GDPR.
9.2 Where we handle personal information on your behalf, the Data Processing Agreement applies and forms part of this agreement.

## 10. Warranty
10.1 For 30 days after launch, we fix defects in our work at no charge. After that, fixes are covered by a monthly plan or quoted.
10.2 We don't promise the work will be free of every error or that third-party services will always be available. We do promise to respond as set out in your monthly plan.
10.3 The Prove guarantee: for a proof of concept, the project order sets one target and how it's measured. If, measured that way at the end of the proof of concept, the target isn't met, we refund 50% of the proof-of-concept fee within 10 business days. This doesn't apply if the information, system access or people agreed in the scope weren't made available, or if you changed the scope during the proof of concept.

## 11. Liability
11.1 Neither of us is liable to the other for indirect or consequential loss, or for lost profit, revenue or data, even if it was foreseeable.
11.2 Our total liability under this agreement is limited to the fees you paid us in the 12 months before the claim arose.
11.3 Nothing in this agreement limits liability for fraud, gross negligence, wilful misconduct, or anything that by law cannot be limited, including your rights under the Consumer Protection Act where it applies.

## 12. Ending the agreement
12.1 You can stop a project at any time by telling us in writing. You pay for the work done up to then and any third-party costs already committed; the deposit counts towards this.
12.2 Monthly plans run for any minimum term in the plan, then month to month, and either of us can end them with one month's written notice.
12.3 Either of us can end this agreement straight away if the other seriously breaches it and doesn't fix the breach within 14 days of written notice.
12.4 When it ends, we hand over your code, data and access within 30 days, once all invoices are paid, and then delete your personal information as set out in the Data Processing Agreement.

## 13. General
13.1 Neither of us is responsible for delays caused by events outside our reasonable control, such as power cuts, outages of third-party services or natural disasters.
13.2 We may use subcontractors; we stay responsible for their work.
13.3 Notices can be sent by email to the addresses in the project order.
13.4 This agreement, with the project orders, monthly plans and the Data Processing Agreement, is the whole agreement between us about this work. Changes must be in writing and agreed by both of us.
13.5 If any part of this agreement is unenforceable, the rest still applies. Not enforcing a right doesn't waive it.
13.6 This agreement is governed by the law of the Republic of South Africa. If a dispute can't be settled by talking within 14 days, either of us may take it to a South African court with jurisdiction.
13.7 We are independent contractors; this agreement doesn't create a partnership or employment.
`,
    },
    {
      id: 'order',
      title: 'Project Order',
      short: 'Project order',
      when: 'For each project, with the quote. Lists exactly what is built, what is measured, the dates and the price.',
      body: `
Project order {{ref}}, dated {{date}}, under the Client Services Agreement between {{us}} and {{client}}.

## 1. What we'll build
{{scope}}

## 2. Not included
- Anything not listed above. Changes are quoted first (Client Services Agreement, clause 2).
- {{not_included}}

## 3. What we'll measure
{{measure}}
For a proof of concept, this is also the target for the Prove guarantee (Client Services Agreement 10.3).

## 4. Dates
{{dates}}

## 5. Price and payment
- Total: {{total}}
- Deposit (40%), due on acceptance: {{deposit}}
- Balance: {{balance}}, {{balance_when}}
- Ongoing costs after launch: {{ongoing}}

## 6. Your part
{{your_part}}

## 7. Where a person checks the result
{{human_check}}

## 8. Contacts
- For {{us}}: {{us_signatory}}, {{us_email}}
- For {{client}}: {{client_contact}}, {{client_email}}
`,
    },
    {
      id: 'plan',
      title: 'Monthly Plan',
      short: 'Monthly plan',
      when: 'When a client starts hosting, Care, Operate, Optimise or Partner after launch.',
      body: `
Monthly plan for {{client}}, starting {{start_date}}, under the Client Services Agreement between {{us}} and {{client}}.

## 1. The plan
- Plan: {{plan_name}}
- Monthly fee: {{plan_fee}}, billed monthly in advance
- Systems covered: {{systems}}
- Minimum term: {{min_term}}, then month to month with one month's notice

## 2. What's included
- Watching the system, and fixing problems with it
- Security updates and upkeep
- Accuracy checks: {{accuracy}}
- AI usage up to {{allowance}} a month (above that, charged at cost; we warn you at 80%)
- Improvement hours: {{hours}} a month (unused hours don't carry over unless your plan says so)
- A monthly report of the time saved

## 3. Response times
Business hours are Monday to Friday, 08:00 to 17:00 South African time, excluding public holidays. A response means a person has picked up the issue and given a first assessment; it is not a promise of a fix by that time.
- Critical (down, or wrong results at scale): {{resp_critical}}
- High (a part failing, with a workaround): {{resp_high}}
- Normal (questions and requests): {{resp_normal}}

## 4. Not included
- New features and new systems: quoted separately.
- Changes beyond the included hours: {{change_rate}} an hour, quoted first.
- Emergency work outside business hours: {{emergency_rate}} an hour, 1-hour minimum.

## 5. Price changes
We may change the monthly fee with 60 days' written notice. You can end the plan before the new price starts.
`,
    },
    {
      id: 'dpa',
      title: 'Data Processing Agreement',
      short: 'Data processing',
      when: 'With the services agreement, whenever the system handles personal information (almost always).',
      body: `
This agreement is between {{client}} ("you", the responsible party or controller) and {{us}} ("we", the operator or processor). It forms part of the Client Services Agreement and applies whenever we handle personal information on your behalf.

## 1. What we handle and why
1.1 We handle personal information only to build, run, support and improve the systems you've asked us for, and only on your documented instructions (the project order, monthly plan and your written requests).
1.2 Types of information and people: {{data_types}}
1.3 If we think an instruction breaks the law, we tell you.

## 2. Keeping it safe
2.1 We keep the information secure with measures that fit the risk, including: access limited to people who need it, unique logins with multi-factor authentication where available, encryption in transit, backups, activity logs, and prompt security updates.
2.2 Everyone who works on your information is bound to keep it confidential.

## 3. Other providers we use
3.1 We use the providers listed in the annex (for example hosting, database, email and AI services). Each is bound by terms that protect your information at least as well as this agreement.
3.2 We tell you at least 14 days before adding or replacing a provider. If you object for a good reason, we'll look for an alternative; if there isn't one, you may end the affected service.

## 4. If something goes wrong
4.1 If we become aware of a breach affecting your personal information, we tell you without undue delay and within 48 hours, with what we know and what we're doing about it.
4.2 We help you meet your own duties, including notifying the Information Regulator, a supervisory authority or the people affected where required.

## 5. Helping you
5.1 We help you respond to people who ask to see, correct or delete their information, and with any risk assessments you need to do.
5.2 We give you the information you reasonably need to show compliance. Once a year, on 30 days' notice, you or an independent auditor may check our compliance, at your cost.

## 6. Information leaving the country
6.1 Some providers may store or process information outside South Africa or, for EU and UK clients, outside the EU or UK. We only do this where the law allows it, for example where the country has adequate protection, the provider is bound by suitable contract terms (including the EU Standard Contractual Clauses or the UK addendum where needed), or you have agreed.

## 7. When the work ends
7.1 Within 30 days of the work ending, we return your personal information to you in a usable format and then delete it, unless the law requires us to keep it. Backups are deleted on their normal cycle.

## 8. Liability
8.1 The liability terms of the Client Services Agreement apply to this agreement.

## Annex: providers
{{providers}}
`,
    },
    {
      id: 'nda',
      title: 'Mutual Non-Disclosure Agreement',
      short: 'NDA',
      when: 'Before a process review or Find step, if the client wants confidentiality agreed first.',
      body: `
This agreement is between {{us}} ({{us_details}}) and {{client}} ({{client_details}}), dated {{date}}.

## 1. Why
1.1 We are talking about how {{us}} could help {{client}}, which may mean sharing confidential information about each other's business, processes, customers or systems.

## 2. What each of us agrees
2.1 To keep the other's confidential information private and use it only to discuss and plan this work.
2.2 To share it only with people who need it for that purpose and are bound to keep it private.
2.3 To return or delete it if the other asks.

## 3. What isn't confidential
3.1 Information that is public through no fault of the receiver, was already known to them, was independently developed, or must be disclosed by law.

## 4. How long
4.1 This agreement lasts for 2 years from the date above, and for as long as any information stays a trade secret.

## 5. General
5.1 Neither of us has to do business with the other because of this agreement.
5.2 It is governed by the law of the Republic of South Africa.
`,
    },
  ];

  // Text shown when a field has no value: a visible gap to fill in, never silent.
  const blank = (k) => '[' + k.replace(/_/g, ' ') + ']';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Fill {{fields}}; a multi-line value becomes a list where it stands on its own line.
  function fill(body, vals) {
    return body.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const v = vals && vals[k];
      return v == null || String(v).trim() === '' ? blank(k) : String(v);
    });
  }

  // Tiny renderer for the format above. Headings, numbered clauses, bullets, paragraphs.
  function toHtml(text) {
    const out = []; let list = null;
    const flush = () => { if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; } };
    const inline = (t) => esc(t).replace(/\[([a-z0-9 ]+)\]/g, '<mark class="ct-gap">[$1]</mark>');
    text.trim().split('\n').forEach((line) => {
      const l = line.trim();
      if (!l) { flush(); return; }
      if (l.startsWith('## ')) { flush(); out.push('<h3>' + inline(l.slice(3)) + '</h3>'); return; }
      if (l.startsWith('- ')) { (list = list || []).push('<li>' + inline(l.slice(2)) + '</li>'); return; }
      flush();
      const m = l.match(/^(\d+\.\d+)\s+(.*)$/);
      out.push(m ? '<p class="ct-clause"><b>' + m[1] + '</b> ' + inline(m[2]) + '</p>' : '<p>' + inline(l) + '</p>');
    });
    flush();
    return out.join('\n');
  }

  root.RC_CONTRACTS = { DOCS, fill, toHtml, byId: (id) => DOCS.find((d) => d.id === id) };
})(typeof window !== 'undefined' ? window : globalThis);
