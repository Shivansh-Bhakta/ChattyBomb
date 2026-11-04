# Graph Report - ChattyBomb  (2026-11-04)

## Corpus Check
- Corpus is ~10,595 words - fits in a single context window. You may not need a graph.

## Summary
- 232 nodes · 410 edges · 14 communities (9 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.86)
- Token cost: 95,529 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `tenants` - 15 edges
3. `next` - 13 edges
4. `users` - 12 edges
5. `authUser()` - 11 edges
6. `asService()` - 11 edges
7. `mockAuthAllowed()` - 11 edges
8. `env()` - 10 edges
9. `Master build spec` - 10 edges
10. `conversations` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Ponytail lazy senior dev mode` --semantically_similar_to--> `Ponytail AGENTS rules`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → ponytail-AGENTS.md
- `Shortcut comment convention` --semantically_similar_to--> `Project conventions`  [INFERRED] [semantically similar]
  .claude/skills/ponytail/SKILL.md → CLAUDE.md
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

## Communities (14 total, 5 thin omitted)

### Community 0 - "Project Spec and Rules"
Cohesion: 0.06
Nodes (46): Next.js agent rules (breaking changes, read node_modules docs), ChattyBomb Omni project, Project conventions, asUser / asService DB helpers (lib/db.ts), graphify usage rules, Milestones M0-M13, MOCK_MODE, Ponytail levels (lite/full/ultra) (+38 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.07
Nodes (35): dependencies, @anthropic-ai/sdk@^1.4.0, inngest@^4.26.2, next@^16.4.5, react@^19.3.1, react-dom@^19.3.1, @supabase/ssr@^0.12.7, @supabase/supabase-js@^2.119.0 (+27 more)

### Community 2 - "Auth Actions and Pages"
Cohesion: 0.15
Nodes (23): cookieOpts, creds, login(), logout(), mockLogin(), onboard(), signup(), AdminPage() (+15 more)

### Community 3 - "Database Schema"
Cohesion: 0.21
Nodes (21): audit_log, channels, chunks, contacts, conversations, current_tenant_id(), documents, invoices (+13 more)

### Community 4 - "DB Access Helpers"
Cohesion: 0.13
Nodes (19): asUser(), closePool(), Db, g, pool(), tx(), Env, onboardingSchema (+11 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 6 - "Env and Encryption"
Cohesion: 0.24
Nodes (8): decrypt(), encrypt(), key(), env(), schema, secret(), vitest@^5.1.0, vitest

### Community 7 - "Local DB Reset"
Cohesion: 0.27
Nodes (5): resetLocalDb(), root, pg@^8.23.1, pg, setup()

### Community 8 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, db:reset, dev, eval, start, test, typecheck

## Knowledge Gaps
- **13 isolated node(s):** `Ponytail levels (lite/full/ultra)`, `Shortcut comment convention`, `Next.js agent rules (breaking changes, read node_modules docs)`, `graphify usage rules`, `asUser / asService DB helpers (lib/db.ts)` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 69 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Auth Actions and Pages` to `Root Layout`, `Package Dependencies`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `Ponytail levels (lite/full/ultra)`, `Shortcut comment convention`, `Next.js agent rules (breaking changes, read node_modules docs)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Spec and Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Why does `pg` connect `Local DB Reset` to `Package Dependencies`, `DB Access Helpers`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07254623044096728 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Env and Encryption` to `Package Dependencies`, `DB Access Helpers`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `DB Access Helpers` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._