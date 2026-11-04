# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 127 files · ~46,096 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 641 nodes · 1892 edges · 31 communities (18 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `15760061`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- startup.ts
- Database Schema
- asService
- TypeScript Config
- pipeline.ts
- pg
- NPM Scripts
- env
- Supabase Auth Shim
- db.ts
- whatsapp.test.ts
- queue.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- asService
- Email channel setup
- db.ts
- package.json
- app/layout.tsx
- nodemailer
- @types/node@^26.6.6
- @types/react@^19.3.0
- 0008_platform_admin.sql

## God Nodes (most connected - your core abstractions)
1. `asService()` - 74 edges
2. `env()` - 52 edges
3. `requireMember()` - 50 edges
4. `asUser()` - 44 edges
5. `next` - 33 edges
6. `zod` - 25 edges
7. `Env` - 24 edges
8. `requireAdmin()` - 21 edges
9. `vitest` - 21 edges
10. `secret()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `The 10 riskiest places, in reading order` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIRST.md → lib/db.ts
- `Needs a human decision` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Phase 1 review (summary)` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Reviewer agent findings` --references--> `ProviderRejectedError`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/channels/types.ts
- `Status table` --references--> `sendMessage()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/channels/outbound.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (31 total, 13 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.14
Nodes (14): devDependencies, tailwindcss@^4.3.4, @tailwindcss/postcss@^4.3.4, @types/mailparser@^3.9.0, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/react-dom@^19.3.0, vitest@^5.1.0 (+6 more)

### Community 2 - "startup.ts"
Cohesion: 0.14
Nodes (16): Fix 5: cost of claude-sonnet-5-5 vs claude-opus-5-5 (rates table), Needs a human decision, Phase 1 review (summary), Phase 3 self-check, Review-and-fix report: M1–M9, Reviewer agent findings, Status table, register() (+8 more)

### Community 3 - "Database Schema"
Cohesion: 0.16
Nodes (24): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+16 more)

### Community 4 - "asService"
Cohesion: 0.12
Nodes (20): mockOutbox, closePool(), resetLocalDb(), root, files(), SCOPES, counts(), q() (+12 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.07
Nodes (49): Review first: M1–M9, Skipped or could not check, The 10 riskiest places, in reading order, q(), Answer, answer(), Chunk, mockAnswer() (+41 more)

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 9 - "env"
Cohesion: 0.14
Nodes (30): GET(), GET(), GET(), GET(), exchangeGoogleCode(), GMAIL_SCOPES, GOOGLE_STATE_COOKIE, googleInstallUrl() (+22 more)

### Community 11 - "db.ts"
Cohesion: 0.10
Nodes (32): assign(), audit(), id, sendReply(), sendTemplate(), setAiPaused(), setStatus(), update() (+24 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.06
Nodes (58): POST(), GET(), POST(), RFC-822, email, gmailCreds, gmailFetch(), googleAccessToken() (+50 more)

### Community 16 - "queue.ts"
Cohesion: 0.20
Nodes (11): GET, POST, PUT, functions, Events, Handler, handlers, inngest (+3 more)

### Community 17 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @anthropic-ai/sdk@^1.4.0, imapflow@^2.10.2, next@^16.4.5, react@^19.3.1, react-dom@^19.3.1, @supabase/ssr@^0.12.7, @supabase/supabase-js@^2.119.0 (+6 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "asService"
Cohesion: 0.09
Nodes (61): addRate(), assistImap(), assistWhatsApp(), changePlan(), done(), grantPilotDays(), saveAlerts(), setOverage() (+53 more)

### Community 21 - "Email channel setup"
Cohesion: 0.33
Nodes (5): Email channel setup, First poll, Option A: Gmail / Google Workspace (OAuth), Option B: any provider via IMAP/SMTP (fallback), Production verification (needed before non-test users)

### Community 22 - "db.ts"
Cohesion: 0.07
Nodes (55): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), checkEmailNow() (+47 more)

### Community 24 - "package.json"
Cohesion: 0.20
Nodes (9): mailparser@^3.14.2, unpdf@^1.9.1, typescript@^6.0.3, name, private, type, mailparser, typescript (+1 more)

## Knowledge Gaps
- **15 isolated node(s):** `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 167 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `asService()` connect `asService` to `startup.ts`, `asService`, `pipeline.ts`, `env`, `db.ts`, `whatsapp.test.ts`, `db.ts`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `asService()` (e.g. with `The 10 riskiest places, in reading order` and `Needs a human decision`) actually correct?**
  _`asService()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `next` connect `db.ts` to `env`, `db.ts`, `whatsapp.test.ts`, `dependencies`, `asService`, `package.json`, `app/layout.tsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `db.ts` to `pipeline.ts`, `env`, `db.ts`, `whatsapp.test.ts`, `dependencies`, `asService`, `package.json`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._