# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 137 files · ~50,331 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 680 nodes · 2048 edges · 28 communities (19 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6dda4686`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- startup.ts
- Database Schema
- billing.test.ts
- TypeScript Config
- pipeline.ts
- lib/db-reset.ts
- NPM Scripts
- env
- Supabase Auth Shim
- db.ts
- whatsapp.test.ts
- invoices.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- asService
- Email channel setup
- db.ts
- package.json
- app/layout.tsx
- 0008_platform_admin.sql

## God Nodes (most connected - your core abstractions)
1. `asService()` - 86 edges
2. `env()` - 57 edges
3. `requireMember()` - 57 edges
4. `asUser()` - 48 edges
5. `next` - 36 edges
6. `zod` - 29 edges
7. `Env` - 26 edges
8. `secret()` - 23 edges
9. `vitest` - 22 edges
10. `requireAdmin()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Needs a human decision` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Phase 1 review (summary)` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/db.ts
- `Skipped or could not check` --references--> `embed()`  [INFERRED]
  docs/REVIEW_FIRST.md → lib/ai/embed.ts
- `Reviewer agent findings` --references--> `processInbound()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/ai/pipeline.ts
- `Status table` --references--> `mockAuthAllowed()`  [INFERRED]
  docs/REVIEW_FIX_REPORT.md → lib/env.ts

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
Nodes (16): devDependencies, @tailwindcss/postcss@^4.3.4, @types/mailparser@^3.9.0, @types/node@^26.6.6, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/react@^19.3.0, @types/react-dom@^19.3.0 (+8 more)

### Community 2 - "startup.ts"
Cohesion: 0.31
Nodes (8): register(), assertStartup(), EMBEDDING_COLUMN_DIM, hostOf(), isLocalDeployment(), LOCAL_HOSTS, productionProblems(), startupProblems()

### Community 3 - "Database Schema"
Cohesion: 0.14
Nodes (26): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+18 more)

### Community 4 - "billing.test.ts"
Cohesion: 0.07
Nodes (52): POST(), POST(), GET(), POST(), q(), applyRazorpayEvent(), eventIdOf(), mockRazorpay (+44 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.08
Nodes (37): GET, POST, PUT, functions, Answer, answer(), Chunk, mockAnswer() (+29 more)

### Community 7 - "lib/db-reset.ts"
Cohesion: 0.38
Nodes (4): resetLocalDb(), root, pg@^8.23.1, pg

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 9 - "env"
Cohesion: 0.09
Nodes (44): GET(), GET(), GET(), GET(), chunkText(), extractText(), ingestDocument(), store() (+36 more)

### Community 11 - "db.ts"
Cohesion: 0.09
Nodes (35): addNote(), assign(), audit(), id, sendReply(), sendTemplate(), setAiPaused(), setStatus() (+27 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.06
Nodes (51): RFC-822, Fix 5: cost of claude-sonnet-5-5 vs claude-opus-5-5 (rates table), Needs a human decision, Phase 1 review (summary), Phase 3 self-check, Review-and-fix report: M1–M9, Reviewer agent findings, Status table (+43 more)

### Community 16 - "invoices.ts"
Cohesion: 0.39
Nodes (7): generateMonthlyInvoices(), GST_RATE, invoiceLines(), Line, previousMonthIST(), rupeesToPaise(), createAddon()

### Community 17 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @anthropic-ai/sdk@^1.4.0, imapflow@^2.10.2, inngest@^4.26.2, mailparser@^3.14.2, next@^16.4.5, nodemailer@^10.3.1, react@^19.3.1 (+8 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "asService"
Cohesion: 0.08
Nodes (62): addRate(), assistImap(), assistWhatsApp(), changePlan(), done(), grantPilotDays(), saveAlerts(), setOverage() (+54 more)

### Community 21 - "Email channel setup"
Cohesion: 0.33
Nodes (5): Email channel setup, First poll, Option A: Gmail / Google Workspace (OAuth), Option B: any provider via IMAP/SMTP (fallback), Production verification (needed before non-test users)

### Community 22 - "db.ts"
Cohesion: 0.07
Nodes (60): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), gstin (+52 more)

### Community 24 - "package.json"
Cohesion: 0.17
Nodes (11): react-dom@^19.3.1, @supabase/supabase-js@^2.119.0, tailwindcss@^4.3.4, typescript@^6.0.3, name, private, type, react-dom (+3 more)

## Knowledge Gaps
- **15 isolated node(s):** `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 173 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `asService()` connect `asService` to `billing.test.ts`, `pipeline.ts`, `env`, `db.ts`, `whatsapp.test.ts`, `invoices.ts`, `db.ts`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `asService()` (e.g. with `The 10 riskiest places, in reading order` and `Needs a human decision`) actually correct?**
  _`asService()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `next` connect `db.ts` to `billing.test.ts`, `env`, `db.ts`, `dependencies`, `asService`, `package.json`, `app/layout.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `db.ts` to `billing.test.ts`, `pipeline.ts`, `env`, `db.ts`, `whatsapp.test.ts`, `dependencies`, `asService`, `package.json`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._