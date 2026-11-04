# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 91 files · ~27,066 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 478 nodes · 1251 edges · 22 communities (16 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2f1c7fac`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- app/layout.tsx
- Database Schema
- asService
- TypeScript Config
- pipeline.ts
- Local DB Reset
- NPM Scripts
- env
- Supabase Auth Shim
- db.ts
- whatsapp.test.ts
- queue.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- @supabase/ssr
- Email channel setup

## God Nodes (most connected - your core abstractions)
1. `env()` - 47 edges
2. `asService()` - 41 edges
3. `requireMember()` - 33 edges
4. `next` - 23 edges
5. `Env` - 22 edges
6. `asUser()` - 22 edges
7. `secret()` - 20 edges
8. `compilerOptions` - 17 edges
9. `zod` - 16 edges
10. `tenants` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Shortcut comment convention` --semantically_similar_to--> `Project conventions`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → CLAUDE.md
- `Ponytail lazy senior dev mode` --semantically_similar_to--> `Ponytail AGENTS rules`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → ponytail-AGENTS.md
- `GET()` --calls--> `requireMember()`  [EXTRACTED]
  app/api/google/install/route.ts → lib/auth.ts
- `GET()` --calls--> `requireMember()`  [EXTRACTED]
  app/api/google/oauth/route.ts → lib/auth.ts
- `GET()` --calls--> `requireMember()`  [EXTRACTED]
  app/api/slack/install/route.ts → lib/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (22 total, 6 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.12
Nodes (23): devDependencies, tailwindcss@^4.3.4, @tailwindcss/postcss@^4.3.4, @types/mailparser@^3.9.0, @types/node@^26.6.6, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/react@^19.3.0 (+15 more)

### Community 3 - "Database Schema"
Cohesion: 0.21
Nodes (21): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+13 more)

### Community 4 - "asService"
Cohesion: 0.09
Nodes (36): POST(), GET(), POST(), q(), chunkText(), ALLOWED_TYPES, extractText(), ingestDocument() (+28 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.11
Nodes (29): Answer, answer(), Chunk, mockAnswer(), schema, Classification, classify(), INTENTS (+21 more)

### Community 7 - "Local DB Reset"
Cohesion: 0.32
Nodes (4): resetLocalDb(), root, pg@^8.23.1, pg

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 9 - "env"
Cohesion: 0.11
Nodes (41): GET(), GET(), GET(), GET(), exchangeGoogleCode(), GMAIL_SCOPES, GOOGLE_STATE_COOKIE, googleInstallUrl() (+33 more)

### Community 11 - "db.ts"
Cohesion: 0.07
Nodes (59): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), checkEmailNow() (+51 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.07
Nodes (37): email, RANK, upsertContact(), adapterFor(), adapters, mockInbox, mockSend(), RFC-822 (+29 more)

### Community 16 - "queue.ts"
Cohesion: 0.18
Nodes (12): GET, POST, PUT, functions, enqueue(), Events, Handler, handlers (+4 more)

### Community 17 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @anthropic-ai/sdk@^1.4.0, imapflow@^2.10.2, mailparser@^3.14.2, next@^16.4.5, react@^19.3.1, react-dom@^19.3.1, @supabase/supabase-js@^2.119.0 (+8 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "@supabase/ssr"
Cohesion: 0.40
Nodes (3): @supabase/ssr@^0.12.7, config, @supabase/ssr

### Community 21 - "Email channel setup"
Cohesion: 0.33
Nodes (5): Email channel setup, First poll, Option A: Gmail / Google Workspace (OAuth), Option B: any provider via IMAP/SMTP (fallback), Production verification (needed before non-test users)

## Knowledge Gaps
- **15 isolated node(s):** `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 134 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `db.ts` to `Package Dependencies`, `app/layout.tsx`, `env`, `dependencies`, `@supabase/ssr`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `env()` connect `env` to `asService`, `pipeline.ts`, `db.ts`, `whatsapp.test.ts`, `queue.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11594202898550725 - nodes in this community are weakly interconnected._
- **Why does `asService()` connect `asService` to `env`, `db.ts`, `pipeline.ts`, `whatsapp.test.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `asService` be split into smaller, more focused modules?**
  _Cohesion score 0.09096045197740113 - nodes in this community are weakly interconnected._