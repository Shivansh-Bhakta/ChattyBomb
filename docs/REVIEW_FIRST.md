# Review first: M1–M9

Built unattended in mock mode. No real Supabase, Meta, Slack, Google, Voyage or Anthropic call was ever made.
52 Vitest tests run against a local Postgres 16 + pgvector with a Supabase-like shim (`supabase/local-shim.sql`).

## The 10 riskiest places, in reading order

1. **RLS policies**: `supabase/migrations/0001_init.sql:285-360` and `0004_users_no_owner_insert.sql`.
   All tenant isolation rests on these policies and the `security definer` helpers `current_tenant_id()` / `is_platform_admin()`.
   Agents have full insert/update/delete on contacts, conversations, messages, documents, chunks, leads and reminders. That is a product choice; tighten it if agents shouldn't delete.
   I found and fixed an owner-can-adopt-any-login hole in 0004. Look for similar ones.
   The migrations have never run on a real Supabase project.
2. **Service-role DB access**: `lib/db.ts:33` (`asService`). It bypasses RLS, and webhooks, jobs, the AI pipeline, metering and deletion all use it.
   Every query must filter by `tenant_id` by hand. Grep for `asService(` and check each one.
3. **Mock login**: `lib/env.ts:50` and `lib/auth.ts:12`. With `MOCK_MODE=true` and a non-production `NODE_ENV`, any `mock_uid` cookie logs you in as that user, and `/login` lists every user.
   Never deploy `next dev` with `MOCK_MODE=true`. Vercel builds set `NODE_ENV=production`, which disables it (tested).
4. **Webhook verification and dedupe**: `lib/channels/whatsapp.ts:33`, `lib/channels/slack.ts:10`, `lib/channels/inbound.ts:11`.
   Signatures are checked over the raw body in constant time, and Slack also rejects timestamps more than 5 minutes off.
   Dedupe and storage share one transaction, so a failure lets the provider's retry through.
   Rate limiting is not built (M13).
5. **AI pipeline**: `lib/ai/pipeline.ts:18`. Skip rules are at :29-30 (AI paused, already with a human, already replied, tenant inactive, over limit). An Inngest retry re-runs classification and is metered again.
   Customer text goes straight into the prompt (prompt injection). Its only output is a reply to that same customer, but **anything in uploaded documents can end up in a reply**, so tell businesses not to upload internal-only files.
   The thresholds (`AI_MIN_RETRIEVAL_SCORE` 0.35, `AI_MIN_CONFIDENCE` 0.6) are untuned guesses.
6. **Outbound send and the 24h window**: `lib/channels/outbound.ts:21`, window check at :33.
   If the provider send succeeds but the DB update after it fails, the message stays `failed` and a retry sends it again.
   The Meta rate country comes only from the `+91` prefix (:15).
7. **Email send and loop guards**: `lib/channels/email.ts:32` (parse) and `:81` (send).
   The AI answers any email that isn't from us, an auto-reply or a mailing list, including spam and newsletters without `List-Id`. That costs tokens, and an auto-responder that sets none of those headers could ping-pong.
   Gmail sends rebuild Re:/References from the stored body's `Subject:` line.
8. **Cost ledger**: `lib/metering.ts:49`. If a rate is missing, the row is stored at **cost 0** and only `console.error` notes it (`meta.missing_rate`), so the margin reports would look better than reality.
   Anthropic rows in `supabase/seed.sql` are list prices to verify, cache read/write for Haiku and the Opus cache write are **assumed** multiples, and Voyage, Meta and FX are **placeholders**.
9. **OAuth installs**: `app/api/slack/oauth/route.ts:6`, `app/api/google/oauth/route.ts:6`, `lib/channels/slack-oauth.ts:31`.
   The state cookie is checked in constant time, and a workspace or address already owned by another tenant is refused.
   Tokens are AES-256-GCM encrypted with one global `ENCRYPTION_KEY`. Rotating that key isn't supported.
10. **Tenant deletion**: `lib/tenants.ts:38`. It can't be undone.
    Postgres rows cascade first. Storage files and Supabase Auth users are removed afterwards on a best-effort basis, and leftovers are only logged.
    Usage and cost history for that tenant disappears from platform reports.
    Reminders (`lib/reminders.ts:33`) are at-most-once: a crash mid-send marks one sent without sending it.

## Skipped or could not check
- **No real external calls**: Meta Graph API (version default `v23.0` unverified), Slack, Gmail/Google OAuth, IMAP/SMTP, Voyage, Anthropic and Supabase Auth/Storage/Realtime were never exercised. The sandbox can't reach them.
- **Voyage dimension**: the 1024 default came from you; I couldn't open Voyage's docs. `embed()` throws if a vector's length differs.
- **Unverified facts in `docs/EMAIL_SETUP.md`**: the Gmail Testing-mode 7-day refresh-token expiry, the 100-test-user cap and the CASA requirement are from memory.
- **Not built**:
  - rate limiting, Gmail Pub/Sub push, the Meta template sync and the WhatsApp Embedded Signup or connect wizard
  - Slack user names, email attachments, OCR for scanned PDFs, AI-suggested replies in the inbox, a holding message on handoff, team invites, shadcn/ui
  - 80%/100% email alerts, inbox pagination past 100
- **Mock vs real AI**: mock classifier, answerer and embeddings are lexical stand-ins. `npm run eval` scores 18/20 in mock mode; the real score is unknown.
- **Refusal fallbacks**: the Anthropic refusal fallback (`fallbacks`) is not enabled. A refusal is treated as a handoff to a human.
- **Thinking cost**: answers use `claude-sonnet-5-5` at effort `low` since the review-fix session (was `claude-opus-5-5`; configurable via `AI_ANSWER_MODEL`). Thinking stays on, so thinking tokens are billed as output.
- **Prompt caching**: the system prompt is short, below the model's minimum cacheable prefix, so caching probably only applies to large retrieved context.
- **UI coverage**: server actions are covered by Playwright smoke runs, not unit tests. Realtime inbox refresh is untested.
- **Graph**: `/graphify .` ran once in full (docs plus code) after M1. Later milestones used `graphify update .` (code only, free); docs changed since M1 aren't re-extracted.
