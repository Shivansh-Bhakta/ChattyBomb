# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- 45 files · ~12,188 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 257 nodes · 462 edges · 16 communities (10 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f3760bf2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Spec and Rules
- Package Dependencies
- Auth Actions and Pages
- Database Schema
- DB Access Helpers
- TypeScript Config
- Env and Encryption
- Local DB Reset
- NPM Scripts
- Root Layout
- Supabase Auth Shim
- metering.ts

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `tenants` - 15 edges
3. `asService()` - 13 edges
4. `next` - 13 edges
5. `users` - 12 edges
6. `authUser()` - 11 edges
7. `mockAuthAllowed()` - 11 edges
8. `env()` - 10 edges
9. `Master build spec` - 10 edges
10. `conversations` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Shortcut comment convention` --semantically_similar_to--> `Project conventions`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → CLAUDE.md
- `Ponytail lazy senior dev mode` --semantically_similar_to--> `Ponytail AGENTS rules`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → ponytail-AGENTS.md
- `AppLayout()` --calls--> `requireMember()`  [EXTRACTED]
  app/(app)/layout.tsx → lib/auth.ts
- `Home()` --calls--> `requireMember()`  [EXTRACTED]
  app/page.tsx → lib/auth.ts
- `Project conventions` --conceptually_related_to--> `Money conventions (paise, numeric INR)`  [INFERRED]
  CLAUDE.md → docs/DATA_MODEL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inbound message pipeline** — docs_architecture_channel_adapter, docs_data_model_webhook_events, docs_architecture_inngest, docs_architecture_ai_reply_flow, docs_architecture_metering [EXTRACTED 0.95]
- **Cost ledger and metering system** — docs_architecture_metering, docs_data_model_usage_events, docs_data_model_rates, docs_master_prompt_admin_console [INFERRED 0.85]
- **Ponytail guidance files** — claude_skills_ponytail_skill_ponytail, ponytail_agents_ponytail_rules, claude_token_efficiency_rules [INFERRED 0.85]

## Communities (16 total, 6 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.07
Nodes (34): dependencies, @anthropic-ai/sdk@^1.4.0, inngest@^4.26.2, next@^16.4.5, react@^19.3.1, react-dom@^19.3.1, @supabase/ssr@^0.12.7, @supabase/supabase-js@^2.119.0 (+26 more)

### Community 2 - "Auth Actions and Pages"
Cohesion: 0.11
Nodes (31): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), AdminPage() (+23 more)

### Community 3 - "Database Schema"
Cohesion: 0.21
Nodes (21): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+13 more)

### Community 4 - "DB Access Helpers"
Cohesion: 0.14
Nodes (21): asUser(), closePool(), Db, g, pool(), tx(), CHANNELS, Filters (+13 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "Env and Encryption"
Cohesion: 0.33
Nodes (5): decrypt(), encrypt(), key(), vitest@^5.1.0, vitest

### Community 7 - "Local DB Reset"
Cohesion: 0.27
Nodes (5): resetLocalDb(), root, pg@^8.23.1, pg, setup()

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

### Community 14 - "metering.ts"
Cohesion: 0.21
Nodes (12): Channel, conversationsThisMonth(), currentRate(), inrPerUnit(), markConversationBilled(), Rate, record(), recordAnthropicUsage() (+4 more)

## Knowledge Gaps
- **13 isolated node(s):** `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)`, `Shortcut comment convention`, `documents table` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 80 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Auth Actions and Pages` to `Root Layout`, `Package Dependencies`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `asUser / asService DB helpers (lib/db.ts)`, `graphify usage rules`, `Ponytail levels (lite/full/ultra)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Env and Encryption` to `Package Dependencies`, `Auth Actions and Pages`, `DB Access Helpers`, `metering.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07357357357357357 - nodes in this community are weakly interconnected._
- **Why does `pg` connect `Local DB Reset` to `Package Dependencies`, `DB Access Helpers`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `Auth Actions and Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.11014492753623188 - nodes in this community are weakly interconnected._