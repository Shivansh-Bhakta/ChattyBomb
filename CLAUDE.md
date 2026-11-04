# ChattyBomb Omni

Multi-tenant SaaS: one inbox for WhatsApp, Slack and Email; AI answers from each
business's own documents; platform-owner console for revenue, AI cost, Meta fees
and margin. Full spec: `docs/MASTER_PROMPT.md` (read by section only, never whole).

Follow ponytail-AGENTS.md for every code change.

## Token-efficiency rules (strict)
1. Keep this file under 150 lines.
2. Ponytail: reuse what exists, prefer stdlib/platform features, minimum code that
   works, plus one small test for risky logic (billing, auth, tenant isolation,
   webhooks). Never cut validation, security or error handling. End each reply
   with what was skipped or not checked.
3. Use the code graph before reading files. After every milestone run `/graphify .`.
   Query it (callers, blast radius) and open only the files it points to.
   No broad greps, no catting large files.
4. One milestone at a time. After each: run tests, commit, 5-line summary, update
   `docs/HANDOFF.md`, then STOP and wait for "next".
5. Terse replies. No restating the request, no re-printing written code. Report:
   what changed, how to run it, what's next, what the owner must do manually.
6. Never paste secrets, long logs or whole files into chat. Failing lines only.
7. Routine work on cheaper models; ask before switching to the most expensive one.
8. If context gets heavy: save state to `docs/HANDOFF.md`, ask for `/clear` or `/compact`.
9. Prefer managed services and libraries over hand-written infra.

## Stack
Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres, Auth,
Realtime, Storage, pgvector) · Inngest (queues, schedules, reminders) · Zod · Vitest ·
Razorpay Subscriptions · Anthropic API · Voyage embeddings · Vercel.

## Architecture summary
Details: `docs/ARCHITECTURE.md`. Schema: `docs/DATA_MODEL.md`.
- One Next.js app. Webhooks in `app/api/webhooks/{whatsapp,slack,email,razorpay}`.
- Channels share one adapter interface in `lib/channels/types.ts`; each channel is
  one file (`whatsapp.ts`, `slack.ts`, `email.ts`) plus a mock. New channel = one adapter.
- Webhook → verify signature → dedupe (`webhook_events`) → store message → enqueue
  Inngest event → 200 fast. AI, sends and reminders run in Inngest functions.
- AI pipeline: classify intent (small model) → retrieve top-k chunks (pgvector,
  tenant-scoped) → answer only from context (larger model, prompt caching) or
  hand off (`needs_human` + summary).
- Every billable call goes through `lib/metering.ts`, which writes `usage_events`
  using prices from `rates`. Never hardcode prices.
- `/admin` is `platform_admin` only and every action is audit-logged.

## Conventions
- Every tenant table has `tenant_id` + RLS. Browser/server-component code uses the
  user's Supabase session. The service-role client is only for webhooks and jobs,
  and must filter by `tenant_id` explicitly.
- Validate all external input with Zod at the boundary (webhooks, forms, API routes).
- Money: invoice amounts in integer paise; usage costs in `numeric(14,6)` INR.
  All prices exclusive of GST.
- Timestamps `timestamptz`, UTC. IDs `uuid`.
- Secrets only via env vars; `.env.example` holds names only; `.env*` is gitignored.
  Refer to secrets by name (e.g. `ANTHROPIC_API_KEY`), never ask for values in chat.
- `MOCK_MODE=true` swaps WhatsApp, Slack, Email, Razorpay and Anthropic for fakes
  so everything runs end to end without keys. The sandbox can't reach those
  services; real testing happens on Vercel previews.
- Channel tokens encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`). Never store
  customer passwords; IMAP uses an app password, encrypted like any token.
- Do not train on customer data. No SOC 2 claims.
- Tests: Vitest, colocated as `*.test.ts`.
- Shortcuts with known limits get a comment: `shortcut: <limit>, <when to upgrade>`.

## Commands
Added in M1 (dev, test, migrate, seed).

## Milestones
M0 plan/docs ✅ · M1 scaffold+auth+RLS · M2 cost ledger · M3 inbox UI · M4 WhatsApp ·
M5 RAG+AI · M6 Slack · M7 Email · M8 leads/reminders · M9 usage/audit/deletion ·
M10 admin console · M11 Razorpay/GST · M12 pilot report · M13 hardening.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
