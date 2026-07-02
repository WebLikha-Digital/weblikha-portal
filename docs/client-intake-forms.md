# Client Intake Forms — Custom App Development Service

Two forms, ready to build in Tally or Typeform. Field types noted per question.
Use **Form 1** on your website / first contact. Send **Form 2** after a call or signed proposal — it's too heavy for cold leads.

The forms are deliberately app-agnostic: they discover the client's *problem and workflow*, and the right app (booking system, inventory tracker, CRM, client portal, internal dashboard, anything) emerges from the answers. Never ask "what app do you want?" — ask "what's broken?"

**Tally tips:** use conditional logic where marked ⤷, mark required fields with *, enable file uploads.

---

## Form 1 — Quick Qualifier (~5 min)

Goal: understand the business, the pain, and whether the project fits. Every answer feeds your proposal.

| # | Question | Field type |
|---|---|---|
| 1 | Company name * | Short text |
| 2 | Your name & role * | Short text |
| 3 | Work email * | Email |
| 4 | What does your business do, in a sentence or two? * | Long text |
| 5 | What problem are you hoping software can solve? Describe it as if telling a friend. * | Long text |
| 6 | How are you handling this today? (spreadsheets, paper, group chats, an app that doesn't fit…) * | Long text |
| 7 | Who will use the app? | Checkboxes: Just me · My team · My clients/customers · The public |
| 8 | Roughly how many users? | Dropdown: 1–5 / 6–15 / 16–50 / 50+ / Public-facing |
| 9 | What happens if you do nothing? What does this problem cost you? (time, money, lost clients, stress) | Long text |
| 10 | Do you have an existing website or brand we should match? | Short text (URL) |
| 11 | Ideal timeline? | Dropdown: ASAP (< 1 month) / 1–2 months / 2–3 months / Flexible |
| 12 | Budget range? | Dropdown — set your own tiers, e.g. ₱80k–150k / ₱150k–300k / ₱300k+ / Not sure |
| 13 | Anything else we should know? | Long text |

---

## Form 2 — Full Discovery (~20–30 min)

Goal: everything needed to spec, design, and quote. Organize as Tally/Typeform sections — one per heading.

### Section A — The Problem & The Process

This section is the heart of the form. Their process description becomes your spec.

| # | Question | Field type |
|---|---|---|
| A1 | Describe your day-to-day operations: who does what, in what order? * | Long text |
| A2 | Walk us through ONE real example of the process this app should handle, start to finish. Be specific — names, steps, tools, handoffs. * | Long text |
| A3 | Where in that process do things go wrong, get slow, or fall through the cracks? * | Long text |
| A4 | Which steps involve repetitive manual work (copying data, chasing people, re-typing)? | Long text |
| A5 | What decisions do you make regularly, and what information do you wish you had at hand when making them? | Long text |
| A6 | If the app works perfectly 6 months from now, what's different about your business? * | Long text |
| A7 | How will you measure success? | Checkboxes: Time saved · Fewer errors · More sales/bookings · Better visibility · Team accountability · Happier customers · Other |

### Section B — Users & Access

| # | Question | Field type |
|---|---|---|
| B1 | List every type of person who will touch the app (e.g., owner, staff, customer, supplier) and what each needs to do in it. * | Long text |
| B2 | Who should see everything (admin)? * | Short text |
| B3 | Is there information some users must NOT see? (finances, salaries, other customers' data…) * | Long text |
| B4 | Will people outside your company log in (customers, clients, partners)? | Multiple choice: Yes / No / Maybe later ⤷ if Yes: "What should they be able to see or do?" (Long text) |
| B5 | How tech-savvy are your least technical users? | Multiple choice: Very — they live in apps / Average / Struggle with new tools — keep it dead simple |

### Section C — What the App Handles

Instead of asking for features, ask what the app must keep track of and do. You translate this into features.

| # | Question | Field type |
|---|---|---|
| C1 | What "things" does the app need to keep track of? (e.g., orders, bookings, patients, inventory, jobs, payments, documents) * | Long text |
| C2 | For each of those, what details matter? (e.g., for an order: customer, items, status, payment, delivery date) | Long text |
| C3 | What should the app DO automatically that a human does today? (send reminders, calculate totals, update statuses, generate reports…) | Long text |
| C4 | What alerts or notifications would be useful, and to whom? | Long text |
| C5 | What numbers/reports do you want to see at a glance? (daily sales, overdue items, staff workload…) | Long text |
| C6 | Does the app need to handle money? | Checkboxes: No · Record payments manually · Accept online payments · Invoicing · Payroll-ish calculations · Other ⤷ if online payments: "Preferred providers?" (GCash, Maya, cards, bank transfer…) (Short text) |
| C7 | Is there anything you're imagining that we haven't asked about? | Long text |
| C8 | What should we explicitly leave OUT of version 1 to keep it simple and affordable? | Long text |

### Section D — Data & Current Tools

| # | Question | Field type |
|---|---|---|
| D1 | What existing data should move into the app? (customer lists, order history, inventory counts…) | Long text |
| D2 | Where does that data live today? | Checkboxes: Excel/Google Sheets · Paper · Group chats · Notion/Trello · Accounting software · Another app · Other |
| D3 | Upload a sample of your current tracking (spreadsheet or screenshot — remove sensitive data). | File upload |
| D4 | Optional but gold: record a 5-min screen/phone video of you doing the current process and paste the link. | Short text (URL) |

### Section E — Integrations & Sign-in

| # | Question | Field type |
|---|---|---|
| E1 | Which tools does your team use daily? | Checkboxes: Google Workspace · Microsoft 365 · Slack · WhatsApp/Viber/Messenger · Accounting (Xero, QuickBooks…) · POS · E-commerce (Shopify…) · Other |
| E2 | Should the app connect to any of them? Which, and to do what? | Long text |
| E3 | How should users sign in? | Multiple choice: Email + password / Google sign-in / Either / No preference |

### Section F — Branding & Look and Feel

| # | Question | Field type |
|---|---|---|
| F1 | Upload your logo (SVG or high-res PNG). | File upload |
| F2 | Brand guidelines or brand colors? | Multiple choice: Yes (will upload) / Colors but no formal guide / No — help us choose ⤷ if yes: File upload |
| F3 | Primary brand colors (hex codes if known). | Short text |
| F4 | Dark or light interface? | Multiple choice: Dark / Light / Both (toggle) / Recommend for us |
| F5 | Words that should describe how the app feels. | Checkboxes: Minimal · Bold · Playful · Corporate · Techy · Warm · Premium · Data-dense · Airy |
| F6 | Share 2–3 links to apps/sites whose look you love, and what you like about each. * | Long text |
| F7 | Any apps/sites whose look you dislike? Why? | Long text |
| F8 | Font preferences, if any. | Short text |

### Section G — Practical Details

| # | Question | Field type |
|---|---|---|
| G1 | Devices it must work well on. * | Checkboxes: Desktop · Tablet · Phone ⤷ if Phone: "Mostly used on the go, or at a desk?" (Multiple choice) |
| G2 | Hard deadline or launch event? | Short text |
| G2a | Will the app be used in places with slow or no internet (field work, events, provinces)? | Multiple choice: Yes, often / Sometimes / No, always online |
| G2b | Do you expect usage to grow a lot? (more branches, more customers, going public) | Multiple choice: Staying about this size / Moderate growth / Big growth planned |
| G2c | After launch, who should own and host the app? | Multiple choice: You host and maintain it for us (recommended) / We want it on our own accounts / Not sure — advise us |
| G2d | Any rules about where your data must be stored, or industry compliance we should know about? (health, finance, government…) | Long text |
| G3 | Confirmed budget for phase 1. | Dropdown (your tiers) |
| G4 | Ongoing support/maintenance after launch? | Multiple choice: Yes, monthly retainer / Ad-hoc / Not yet decided |
| G5 | Single point of contact for decisions and approvals? * | Short text |
| G6 | Anything else? | Long text |

---

## Internal — Tech Stack Decision Guide

**Not client-facing.** Never ask clients about tech stack; they answer in requirements, you translate. Default to one stack and deviate only when a requirement forces it — every deviation costs you speed, reuse, and maintainability across clients.

### Default stack (fits ~90% of projects)

Next.js + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS, Storage, Realtime) + Vercel — the weblikha-portal stack. One stack across clients means shared components, shared patterns, faster builds, and any team member can maintain any project.

### When form answers force a deviation

| Form signal | Deviation |
|---|---|
| G1 = phone-primary, used on the go (couriers, field staff) | PWA first; true native (Expo/React Native) only if camera/GPS/push are core |
| G2a = offline often | Local-first sync layer (e.g., PowerSync + Supabase) — flag as cost/complexity add |
| G2b = big growth / public-facing at scale | Same stack, but plan queues/background jobs (e.g., Inngest/Trigger.dev) and load-test |
| G2c = client hosts on own accounts | Their Supabase/Vercel accounts, you as collaborator — price handover docs separately |
| G2d = compliance/data residency | Check Supabase region options; self-hosted Postgres if required — significant cost add |
| C3 = heavy automations across other tools | Add n8n or scheduled jobs alongside the app rather than hand-coding every integration |
| C6 = online payments | GCash/Maya via Xendit or PayMongo; Stripe if international cards |
| Problem is really a website/content need | Webflow (your agency's home turf) — not a custom app; different service line |
| Problem is really selling products online | Shopify/Webflow e-commerce first; custom only if truly bespoke logic |

### Rules of thumb

1. Deviate from the default only when a written requirement demands it — never for novelty.
2. If two stacks both work, pick the one your team already maintains elsewhere.
3. Put the chosen stack + reasoning in the proposal in one plain-language paragraph ("built on the same technology used by X, hosted on Y, your data stored in Z") — clients care about ownership, cost, and longevity, not framework names.

---

## Recommendations beyond the form

1. **Diagnose, don't take orders.** Clients often arrive asking for the wrong app ("I need a CRM") when the real problem is elsewhere. Q5/Q6 of Form 1 and Section A force the problem out before any solution talk. You prescribe the app; that's the value of your service.
2. **A2 + C1/C2 = your data model.** "Walk me through one real example" gives you the workflow; "what things does it track and what details matter" gives you the entities and fields. Those two answers are 80% of the spec regardless of app type.
3. **Ask for the video (D4).** A 5-minute recording of them doing the process beats 20 written answers, and it's where you spot the automation wins they didn't think to mention.
4. **Show, don't ask, for look & feel.** After Form 2, build 2–3 style tiles or a single mocked screen from their Section F answers and let them react. Reactions beat descriptions.
5. **C8 + budget = phase 1 scope.** Quote version 1 from the must-haves only, and point to their own "leave out" answer when scope creep starts. Sell phase 2 later.
6. **Turn Form 2 into the kickoff call agenda.** Don't just read answers — follow up on every vague one ("you said 'approvals' — who approves, what happens on reject?"). The form is the map; the call is the territory.
7. **Build a small demo library over time.** Each app you ship becomes a sales asset. Showing a past build and asking "what would you change for your business?" pre-fills half of discovery.
