# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 115 files · ~37,136 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 564 nodes · 1595 edges · 25 communities (17 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a0f8fc32`
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
- Local DB Reset
- NPM Scripts
- app/layout.tsx
- Supabase Auth Shim
- db.ts
- whatsapp.test.ts
- outbound.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- rate-limit.test.ts
- Email channel setup
- env
- service-scope.test.ts

## God Nodes (most connected - your core abstractions)
1. `asService()` - 53 edges
2. `requireMember()` - 49 edges
3. `env()` - 48 edges
4. `asUser()` - 44 edges
5. `next` - 30 edges
6. `Env` - 22 edges
7. `secret()` - 20 edges
8. `zod` - 20 edges
9. `vitest` - 20 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `The 10 riskiest places, in reading order` --references--> `asService()`  [INFERRED]
  docs/REVIEW_FIRST.md → lib/db.ts
- `Skipped or could not check` --references--> `embed()`  [INFERRED]
  docs/REVIEW_FIRST.md → lib/ai/embed.ts
- `Shortcut comment convention` --semantically_similar_to--> `Project conventions`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → CLAUDE.md
- `Ponytail lazy senior dev mode` --semantically_similar_to--> `Ponytail AGENTS rules`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → ponytail-AGENTS.md
- `signup()` --calls--> `asService()`  [EXTRACTED]
  app/actions/auth.ts → lib/db.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (25 total, 8 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.12
Nodes (23): devDependencies, tailwindcss@^4.3.4, @tailwindcss/postcss@^4.3.4, @types/mailparser@^3.9.0, @types/node@^26.6.6, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/react@^19.3.0 (+15 more)

### Community 2 - "startup.ts"
Cohesion: 0.31
Nodes (8): register(), assertStartup(), EMBEDDING_COLUMN_DIM, hostOf(), isLocalDeployment(), LOCAL_HOSTS, productionProblems(), startupProblems()

### Community 3 - "Database Schema"
Cohesion: 0.16
Nodes (24): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+16 more)

### Community 4 - "asService"
Cohesion: 0.11
Nodes (32): q(), q(), mockInbox, mockOutbox, RFC-822, q(), q(), q() (+24 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.08
Nodes (45): Review first: M1–M9, Skipped or could not check, The 10 riskiest places, in reading order, Answer, answer(), Chunk, mockAnswer(), schema (+37 more)

### Community 7 - "Local DB Reset"
Cohesion: 0.38
Nodes (4): resetLocalDb(), root, pg@^8.23.1, pg

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 11 - "db.ts"
Cohesion: 0.07
Nodes (53): checkEmailNow(), connectImap(), imapForm, setSlackChannel(), setTemplates(), byExt, deleteDocument(), uploadDocument() (+45 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.08
Nodes (31): RFC-822, email, gmailCreds, gmailFetch(), googleAccessToken(), ids(), imapCreds, isMachineSender() (+23 more)

### Community 16 - "outbound.ts"
Cohesion: 0.11
Nodes (22): GET, POST, PUT, functions, adapterFor(), ambiguous(), countryOf(), Sender (+14 more)

### Community 17 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, @anthropic-ai/sdk@^1.4.0, imapflow@^2.10.2, mailparser@^3.14.2, next@^16.4.5, nodemailer@^10.3.1, react@^19.3.1, react-dom@^19.3.1 (+12 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "rate-limit.test.ts"
Cohesion: 0.17
Nodes (21): POST(), GET(), POST(), applyStatuses(), ingestMessages(), RANK, upsertContact(), markConversationBilled() (+13 more)

### Community 21 - "Email channel setup"
Cohesion: 0.33
Nodes (5): Email channel setup, First poll, Option A: Gmail / Google Workspace (OAuth), Option B: any provider via IMAP/SMTP (fallback), Production verification (needed before non-test users)

### Community 22 - "env"
Cohesion: 0.08
Nodes (52): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), deleteMyTenant() (+44 more)

## Knowledge Gaps
- **15 isolated node(s):** `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 154 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `asService()` connect `asService` to `pipeline.ts`, `whatsapp.test.ts`, `outbound.ts`, `rate-limit.test.ts`, `env`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `RFC-822`, `RFC-822`, `asUser / asService DB helpers (lib/db.ts)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `next` connect `env` to `Package Dependencies`, `app/layout.tsx`, `db.ts`, `dependencies`, `rate-limit.test.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11594202898550725 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `asService` to `Package Dependencies`, `startup.ts`, `pipeline.ts`, `Local DB Reset`, `rate-limit.test.ts`, `env`, `service-scope.test.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `asService` be split into smaller, more focused modules?**
  _Cohesion score 0.11038961038961038 - nodes in this community are weakly interconnected._