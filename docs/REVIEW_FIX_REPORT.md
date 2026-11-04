# Review-and-fix report: M1–M9

Mock mode only. No real keys and no real network calls. Branch: `claude/awesome-hypatia-nf6pc4`.
`main` has none of the M1–M9 code, and this branch is `main` plus that work, so I kept working here instead of starting a new branch from `main` (that would have dropped the code under review).

## Phase 1 review (summary)
1. **A**: 29 `asService` calls. None crossed tenants: ID-only updates only touched rows already checked against the tenant. They now all carry an explicit `tenant_id` filter or a documented scope (webhook-lookup, platform-job, mock-auth, onboarding). `lib/service-scope.test.ts` fails on any new unannotated call.
2. **B**: holes, mostly reachable through Supabase's PostgREST API with a user's own login token:
   - Members could write rows pointing at another tenant's conversation, contact or document.
   - Members could impersonate a colleague (`sender_user_id`, `created_by`) and edit or delete message history, including AI replies.
3. **B, continued**:
   - Owners could rewrite `users.id` (adopt any login).
   - Owners could insert channels or change `external_id` (steal webhook routing).
   - Owners could extend the WhatsApp 24h window via `last_inbound_at`.
   - Users could write audit rows as 'ai' or 'platform_admin'.
   - Tenants could read `rates` and unit costs (your margins).
4. **B, already fine**: all 15 public tables have RLS enabled. The `security definer` helpers take no caller input, only `auth.uid()`, and have a fixed `search_path`. `anon` had no policies.
5. **C**: mock login was gated only on `NODE_ENV`. There was no startup refusal and no host check.

## Status table
| Item | Status | What changed | Proving test |
|---|---|---|---|
| A. asService tenant scoping | fixed (hardening; no live leak found) | explicit `tenant_id` filters + `// scope:` on all 29 calls | `lib/service-scope.test.ts`; `lib/ai/ai.test.ts` "processInbound ignores a message id that belongs to another tenant" |
| B. RLS holes | fixed | `supabase/migrations/0005_rls_hardening.sql`: least-privilege table and column grants (anon nothing; future tables start closed), an `enforce_tenant_refs` trigger on 8 tables (cross-tenant references, users may only add their own notes and reminders), the audit insert policy requires `actor_type='user'`, `rates` readable by platform admins only, usage cost columns hidden from tenants | `lib/rls-hardening.test.ts` (6 tests, one per hole), `lib/tenant-isolation.test.ts` updated |
| C. Mock login refusal | fixed | `lib/startup.ts` + `instrumentation.ts`: refuses to start with MOCK_MODE=true and NODE_ENV=production, or with MOCK_MODE=true unless APP_URL is localhost and not on Vercel. `mockAuthAllowed()` also requires localhost; `npm run dev` binds 127.0.0.1 | `lib/startup.test.ts` (4 tests); I also ran `next start` by hand: it refused with MOCK_MODE=true |
| 1. Unpriced usage | fixed | a missing rate keeps the row (quantity kept for re-pricing) with `meta.unpriced=true`, writes a platform-only `metering.unpriced` audit event (tenant_id null, invisible to tenants), logs `console.error`, and shows a counter on `/admin` (`unpricedSummary`). Ledger table and `record()` signature unchanged | `lib/metering.test.ts` "marks a missing rate as unpriced…" and "…visible to platform admins only" |
| 2. Outbound exactly-once | fixed | `0006_send_state.sql` (`sending` status, `messages.idempotency_key` unique per tenant). `sendMessage` records 'sending' before the provider call; with a key, a retry re-sends only from queued/failed, never from sent or sending; a provider timeout is treated as unknown (no re-send). AI replies use `ai-reply:<inbound id>`, reminders use `reminder:<id>`. Optional 5th argument; channel adapter interface unchanged | `lib/channels/outbound.test.ts` (crash-after-send, failure then retry, timeout, 3 concurrent retries) |
| 3. Email loop guard | fixed | `isMachineSender` drops noreply@, no-reply@, donotreply@, do-not-reply@, mailer-daemon@, postmaster@ (also with +tags). `AI_EMAIL_DAILY_REPLY_CAP` (default 5) counts AI replies per sender per rolling 24h; at the cap the thread goes to a human (`email_daily_cap`) | `lib/channels/email.test.ts` "email loop guards" (2 tests) |
| 4. Rate limiting | fixed | `lib/rate-limit.ts` (in-memory fixed window). Webhooks verify first: valid signed requests are never limited; failed verifications get 30/min per IP, then 429. Content-Length over 1 MB gets 413 before the body is read. Login/signup POSTs: 20 per 10 min per IP in `proxy.ts`, then 429 with Retry-After | `lib/rate-limit.test.ts` (5 tests incl. 150 valid WhatsApp and 60 valid Slack requests never limited) |
| 5. Answer model | fixed | `AI_ANSWER_MODEL` default `claude-sonnet-5-5` (still configurable). Sonnet 5.5 rates seeded and Opus kept. CLAUDE.md and REVIEW_FIRST.md updated | `lib/metering.test.ts` "answers default to claude-sonnet-5-5, and every default model has all four rates" |
| 6. Production config check | fixed | `startupProblems()` in production requires DATABASE_URL, ENCRYPTION_KEY (strict base64, 32 bytes), EMBEDDING_DIM (=1024), EMBEDDING_MODEL, Supabase URL (https), anon key, service key (different from anon), ANTHROPIC_API_KEY (`sk-ant-`), VOYAGE_API_KEY. EMBEDDING_DIM≠1024 is refused in every environment. Messages name variables, never values | `lib/startup.test.ts` "production configuration check" (4 tests); I also ran `next start` by hand: it listed the missing names only |

## Fix 5: cost of claude-sonnet-5-5 vs claude-opus-5-5 (rates table)
- Seeded rates per million tokens: Sonnet 5.5 costs $2 input / $10 output / $0.20 cache read / $2.50 cache write; Opus 5.5 costs $4 / $20 / $0.20 / $5. So Sonnet is half the price on input, output and cache writes, and the same on cache reads.
- For a typical answer of about 3,000 input tokens (system prompt + 5 chunks + history) and 400 output tokens (reply + low-effort thinking): Opus ≈ $0.020 ≈ ₹1.70, Sonnet ≈ $0.010 ≈ ₹0.85. That is ≈ ₹850 saved per 1,000 AI answers.
- Assumptions: the token counts per answer, the FX rate (85 INR/USD is a placeholder), and both cache-write prices (1.25× input). The input/output/cache-read list prices come from Anthropic's model table cached 2026-10-06 and were not checked live.

## Phase 3 self-check
- Typecheck: clean. **Lint: no linter is configured in this repo** (Next 16 dropped `next lint`); I did not add one (see decisions). Vitest: **86/86 passing** (16 files). Production build: passes, including after fix 7.
- I ran `next start` by hand: it refuses to start with MOCK_MODE=true; with MOCK_MODE=false and keys missing it lists only the variable names.
- Browser smoke runs (inbox, reply, documents, Slack connect, templates, reminders, leads, settings, deletion, admin counter) all pass on the hardened grants.
- `npm run eval` (MOCK_MODE): **18/20, unchanged**. The same two misses ("Thyroid profile kitne ka hai?", "When will I get my test report?") are limits of the lexical mock embeddings. Fix 5 does not touch the mock path.
- asService re-grep: 29 calls, **0 unannotated**.
- `graphify update .` run; graph has 564 nodes.
- Secrets: only `.env.example` (names only) is tracked; no key patterns in tracked files or history. `vitest.config.ts` holds a fixed test-only ENCRYPTION_KEY.

## Reviewer agent findings
A separate general-purpose agent reviewed only the diff with the brief. It found no high-severity tenant-isolation hole. I fixed findings 1–8 in **fix 7** (`supabase/migrations/0007_review_fixes.sql` plus code), each with a test.

| # | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| 1 | med | A retry after the AI reply went out re-ran classify/answer (double AI billing) | fixed: `processInbound` checks the `ai-reply:<id>` row before classifying | ai.test "a retry after the reply was sent neither re-runs the AI nor re-sends" |
| 2 | med | Only timeouts were treated as unknown; 5xx, socket resets and SMTP-after-DATA errors were re-sent | fixed: adapters throw `ProviderRejectedError` only for definite rejections (4xx, Slack ok:false, missing or undecryptable credentials, SMTP 5xx/auth). Anything else stays `sending` | outbound.test "treats a provider 5xx or socket error as unknown…" |
| 3 | med | A retry from `failed` sent new text but kept the old body on record | fixed: the retry updates body/is_template/template_name | outbound.test "…records the new text…" |
| 4 | med | Unknown-outcome AI replies were silently dropped | fixed: the pipeline hands off (`send_failed` / `send_outcome_unknown`). No reconciliation sweep (see decisions) | ai.test "an AI reply with an unknown outcome is handed to a human…" |
| 5 | low | Scope test matched "tenant" in its own comment | fixed: strips the comment and requires `tenant_id`/`tenantId` | `lib/service-scope.test.ts` |
| 6 | low | Mock login assumed localhost when APP_URL was unset | fixed: mock mode needs an explicit local APP_URL | startup.test "Unset APP_URL is not assumed to be local" |
| 7 | low | 0005 removed the platform-admin audit insert path | fixed: admins may insert with actor_type='platform_admin' as themselves | rls-hardening.test "platform admins can write audit entries…" |
| 8 | low | Members could read `channels.credentials_encrypted` | fixed: column-level select on channels | rls-hardening.test "members cannot read stored channel credentials" |
| 9 | low | Machine senders are dropped instead of stored | **rejected**: you asked for these senders to be skipped. Storing them would also count bounces and notifications as billed conversations. Listed under decisions |  |
| 10 | low | Email cap can be overshot by up to 4 under concurrency | **rejected**: the reviewer rated it acceptable; auto-submitted headers already block most loops, and the cap still bounds it |  |
| 11 | low | Rate limiter: spoofable x-forwarded-for off Vercel, per-instance, Supabase Auth directly callable | **rejected as a code change**: this is the agreed lightweight shortcut. Supabase Auth has its own server-side rate limits. Listed under decisions |  |


## Needs a human decision
- **Branch**: work continues on `claude/awesome-hypatia-nf6pc4` because `main` lacks M1–M9. Merge this branch's PR (or tell me another base) before M10.
- **Linter**: choose ESLint (flat config + typescript-eslint + Next plugin) or Biome. None was added.
- **Rate-limit store**: counters live in process memory per server instance. On Vercel each instance counts separately. Move to Postgres or Upstash if abuse spans instances.
- **Agents' write rights**: agents may still delete documents and edit lead status and contact name/notes; owners may delete members and change roles (including demoting themselves). Restrict these further if needed.
- **Platform admin console (M10)** will need to read cost columns. Tenants' column grants now hide them, so the console must read them with `asService` (with an admin check) or get a separate grant.
- **Sends with unknown outcome** (status `sending`) are never retried automatically. AI replies are handed to a human, but there is no sweep job, and if the provider did deliver, the Meta fee is not metered and later status webhooks can't match the row. Decide on a reconciliation job (e.g. hourly: list `sending` rows older than 10 min for review).
- **Machine senders** (noreply@, postmaster@ …) are dropped entirely, as you asked. If website-form notifications from no-reply@ addresses should become leads, store them without the AI step instead.
- **Rate limiter off Vercel**: it trusts the first `x-forwarded-for` hop. Behind another proxy, configure that proxy to overwrite it.
- **Email cap**: 5 AI replies per sender per 24h is a guess. Busy legitimate customers may hit it and be handed to a human.
