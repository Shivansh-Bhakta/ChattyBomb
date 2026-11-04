# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 145 files · ~55,053 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 724 nodes · 2182 edges · 28 communities (19 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `284f9c97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- env.ts
- Database Schema
- slack.test.ts
- TypeScript Config
- pipeline.ts
- lib/db-reset.ts
- NPM Scripts
- env
- Supabase Auth Shim
- rate-limit.test.ts
- whatsapp.test.ts
- Setting up each service
- billing.test.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- asService
- Email channel setup
- db.ts
- @supabase/ssr
- mailparser
- 0008_platform_admin.sql

## God Nodes (most connected - your core abstractions)
1. `asService()` - 97 edges
2. `requireMember()` - 60 edges
3. `env()` - 60 edges
4. `asUser()` - 51 edges
5. `next` - 36 edges
6. `zod` - 29 edges
7. `Env` - 27 edges
8. `vitest` - 24 edges
9. `secret()` - 23 edges
10. `requireAdmin()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `The 10 riskiest places, in reading order` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIRST.md → lib/db.ts
- `Needs a human decision` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Phase 1 review (summary)` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Status table` --references--> `sendMessage()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/channels/outbound.ts
- `Status table` --references--> `unpricedSummary()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/metering.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (28 total, 9 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.12
Nodes (23): devDependencies, tailwindcss@^4.3.4, @tailwindcss/postcss@^4.3.4, @types/mailparser@^3.9.0, @types/node@^26.6.6, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/react@^19.3.0 (+15 more)

### Community 2 - "env.ts"
Cohesion: 0.07
Nodes (38): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), refQuery(), signup() (+30 more)

### Community 3 - "Database Schema"
Cohesion: 0.12
Nodes (27): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+19 more)

### Community 4 - "slack.test.ts"
Cohesion: 0.09
Nodes (38): GET(), GET(), POST(), q(), usage(), applyStatuses(), mockInbox, mockOutbox (+30 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.08
Nodes (43): Review first: M1–M9, Skipped or could not check, The 10 riskiest places, in reading order, Answer, answer(), Chunk, mockAnswer(), schema (+35 more)

### Community 7 - "lib/db-reset.ts"
Cohesion: 0.22
Nodes (6): resetLocalDb(), root, files(), SCOPES, pg@^8.23.1, pg

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 9 - "env"
Cohesion: 0.14
Nodes (33): GET(), GET(), GET(), GET(), startSubscription(), exchangeGoogleCode(), GMAIL_SCOPES, GOOGLE_STATE_COOKIE (+25 more)

### Community 11 - "rate-limit.test.ts"
Cohesion: 0.12
Nodes (26): POST(), POST(), api(), applyRazorpayEvent(), createAddon(), eventIdOf(), mockRazorpay, ts (+18 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.06
Nodes (41): RFC-822, Fix 5: cost of claude-sonnet-5-5 vs claude-opus-5-5 (rates table), Needs a human decision, Phase 1 review (summary), Phase 3 self-check, Review-and-fix report: M1–M9, Reviewer agent findings, Status table (+33 more)

### Community 15 - "Setting up each service"
Cohesion: 0.13
Nodes (14): Before real customers, ChattyBomb Omni, Deployment checklist, Environment variables, Google Cloud (Gmail), Inngest (jobs: AI replies, email polling, reminders, alerts, invoices, pilot expiry), Landing page, Monitoring (+6 more)

### Community 16 - "billing.test.ts"
Cohesion: 0.07
Nodes (43): GET, POST, PUT, PilotReportPage(), functions, q(), AlertSettings, alertSettingsSchema (+35 more)

### Community 17 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @anthropic-ai/sdk@^1.4.0, imapflow@^2.10.2, inngest@^4.26.2, next@^16.4.5, nodemailer@^10.3.1, react@^19.3.1, react-dom@^19.3.1 (+10 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "asService"
Cohesion: 0.11
Nodes (48): addRate(), assistImap(), assistWhatsApp(), changePlan(), done(), grantPilotDays(), saveAlerts(), setOverage() (+40 more)

### Community 21 - "Email channel setup"
Cohesion: 0.33
Nodes (5): Email channel setup, First poll, Option A: Gmail / Google Workspace (OAuth), Option B: any provider via IMAP/SMTP (fallback), Production verification (needed before non-test users)

### Community 22 - "db.ts"
Cohesion: 0.06
Nodes (63): gstin, saveBillingDetails(), subscribe(), checkEmailNow(), connectImap(), connectWhatsApp(), imapForm, setSlackChannel() (+55 more)

## Knowledge Gaps
- **15 isolated node(s):** `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 188 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `asService()` connect `billing.test.ts` to `env.ts`, `slack.test.ts`, `pipeline.ts`, `env`, `rate-limit.test.ts`, `whatsapp.test.ts`, `asService`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `asService()` (e.g. with `The 10 riskiest places, in reading order` and `Needs a human decision`) actually correct?**
  _`asService()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `next` connect `db.ts` to `Package Dependencies`, `env.ts`, `slack.test.ts`, `env`, `rate-limit.test.ts`, `dependencies`, `asService`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11594202898550725 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `env.ts` to `Package Dependencies`, `slack.test.ts`, `pipeline.ts`, `env`, `rate-limit.test.ts`, `whatsapp.test.ts`, `billing.test.ts`, `dependencies`, `asService`, `db.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._