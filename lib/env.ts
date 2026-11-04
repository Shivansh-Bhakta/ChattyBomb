import { z } from "zod";
import { isLocalDeployment } from "./startup.ts";

const schema = z
  .object({
    MOCK_MODE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    NODE_ENV: z.string().default("development"),
    DATABASE_URL: z.string().url(),
    ENCRYPTION_KEY: z.string().refine((k) => Buffer.from(k, "base64").length === 32, "must be 32 bytes, base64"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_CLASSIFY_MODEL: z.string().default("claude-haiku-5-5"),
    AI_ANSWER_MODEL: z.string().default("claude-opus-5-5"),
    AI_MIN_RETRIEVAL_SCORE: z.coerce.number().min(0).max(1).optional(),
    AI_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
    AI_EMAIL_DAILY_REPLY_CAP: z.coerce.number().int().min(0).max(1000).default(5),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    VOYAGE_API_KEY: z.string().optional(),
    EMBEDDING_MODEL: z.string().default("voyage-3.5-lite"),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    SLACK_SIGNING_SECRET: z.string().optional(),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.MOCK_MODE) return;
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const) {
      if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when MOCK_MODE=false" });
    }
  })

  // shortcut: 0.35 is a starting guess for voyage cosine scores, tune with `npm run eval` on real data.
  // Mock embeddings are lexical and score lower, so mock mode gets its own default.
  .transform((e) => ({ ...e, AI_MIN_RETRIEVAL_SCORE: e.AI_MIN_RETRIEVAL_SCORE ?? (e.MOCK_MODE ? 0.15 : 0.35) }));

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Parsed env. Throws listing missing names (never values). */
export function env(): Env {
  return (cached ??= schema.parse(process.env));
}

/** Mock login is allowed only in mock mode and never in a production build. */
/** Mock login is allowed only in mock mode, never in a production build, and only on localhost. */
export const mockAuthAllowed = () => env().MOCK_MODE && env().NODE_ENV !== "production" && isLocalDeployment(process.env);

/** Fetches a secret by name only when a real call needs it. */
export function secret(name: "ANTHROPIC_API_KEY" | "VOYAGE_API_KEY" | "SUPABASE_SERVICE_ROLE_KEY" | "SLACK_SIGNING_SECRET" | "SLACK_CLIENT_ID" | "SLACK_CLIENT_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "WHATSAPP_APP_SECRET" | "WHATSAPP_VERIFY_TOKEN"): string {
  const v = env()[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
