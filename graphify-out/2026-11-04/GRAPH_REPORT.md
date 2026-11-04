# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 83 files · ~23,684 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 424 nodes · 1048 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d181e2a7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- Auth Actions and Pages
- Database Schema
- DB Access Helpers
- TypeScript Config
- pipeline.ts
- Local DB Reset
- NPM Scripts
- slack-oauth.ts
- Supabase Auth Shim
- db.ts
- whatsapp.test.ts
- queue.ts
- dependencies
- Sunrise Clinic: patient FAQ and price list
- @supabase/ssr

## God Nodes (most connected - your core abstractions)
1. `env()` - 36 edges
2. `asService()` - 33 edges
3. `requireMember()` - 27 edges
4. `asUser()` - 21 edges
5. `next` - 20 edges
6. `Env` - 17 edges
7. `compilerOptions` - 17 edges
8. `secret()` - 15 edges
9. `tenants` - 15 edges
10. `zod` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Shortcut comment convention` --semantically_similar_to--> `Project conventions`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → CLAUDE.md
- `Ponytail lazy senior dev mode` --semantically_similar_to--> `Ponytail AGENTS rules`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → ponytail-AGENTS.md
- `AppLayout()` --calls--> `requireMember()`  [EXTRACTED]
  app/(app)/layout.tsx → lib/auth.ts
- `GET()` --calls--> `requireMember()`  [EXTRACTED]
  app/api/slack/install/route.ts → lib/auth.ts
- `GET()` --calls--> `env()`  [EXTRACTED]
  app/api/slack/install/route.ts → lib/env.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (21 total, 5 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.14
Nodes (19): devDependencies, tailwindcss@^4.3.4, @tailwindcss/postcss@^4.3.4, @types/node@^26.6.6, @types/pg@^8.23.1, @types/react@^19.3.0, @types/react-dom@^19.3.0, typescript@^6.0.3 (+11 more)

### Community 2 - "Auth Actions and Pages"
Cohesion: 0.11
Nodes (25): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), AdminPage() (+17 more)

### Community 3 - "Database Schema"
Cohesion: 0.21
Nodes (21): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+13 more)

### Community 4 - "DB Access Helpers"
Cohesion: 0.17
Nodes (13): q(), closePool(), inTx(), vitest, A_AGENT, A_OWNER, ADMIN, B_OWNER (+5 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.09
Nodes (48): Answer, answer(), Chunk, mockAnswer(), schema, chunkText(), Classification, classify() (+40 more)

### Community 7 - "Local DB Reset"
Cohesion: 0.28
Nodes (4): resetLocalDb(), root, pg@^8.23.1, pg

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 9 - "slack-oauth.ts"
Cohesion: 0.24
Nodes (12): GET(), GET(), exchangeCode(), Install, installUrl(), redirectUri(), saveInstall(), SLACK_SCOPES (+4 more)

### Community 11 - "db.ts"
Cohesion: 0.11
Nodes (36): setSlackChannel(), byExt, deleteDocument(), uploadDocument(), addNote(), assign(), audit(), id (+28 more)

### Community 14 - "whatsapp.test.ts"
Cohesion: 0.08
Nodes (38): POST(), GET(), POST(), q(), applyStatuses(), ingestMessages(), RANK, upsertContact() (+30 more)

### Community 16 - "queue.ts"
Cohesion: 0.20
Nodes (11): GET, POST, PUT, functions, Events, Handler, handlers, inngest (+3 more)

### Community 17 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @anthropic-ai/sdk@^1.4.0, next@^16.4.5, react@^19.3.1, react-dom@^19.3.1, @supabase/supabase-js@^2.119.0, unpdf@^1.9.1, zod@^4.6.7 (+4 more)

### Community 18 - "Sunrise Clinic: patient FAQ and price list"
Cohesion: 0.20
Nodes (9): Appointments, Cancellation, Consultation fees, Doctors, Location and parking, Payments, Sunrise Clinic: patient FAQ and price list, Tests and packages (+1 more)

### Community 19 - "@supabase/ssr"
Cohesion: 0.40
Nodes (3): @supabase/ssr@^0.12.7, config, @supabase/ssr

## Knowledge Gaps
- **13 isolated node(s):** `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)`, `Shortcut comment convention`, `documents table` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 124 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Auth Actions and Pages` to `Package Dependencies`, `slack-oauth.ts`, `db.ts`, `dependencies`, `@supabase/ssr`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `db.ts` to `Package Dependencies`, `Auth Actions and Pages`, `pipeline.ts`, `whatsapp.test.ts`, `dependencies`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Why does `asService()` connect `Auth Actions and Pages` to `DB Access Helpers`, `pipeline.ts`, `slack-oauth.ts`, `db.ts`, `whatsapp.test.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `Auth Actions and Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.11282051282051282 - nodes in this community are weakly interconnected._