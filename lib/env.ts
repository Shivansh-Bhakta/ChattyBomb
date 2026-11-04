import { z } from "zod";

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
    AI_ANSWER_MODEL: z.string().default("claude-sonnet-5-5"),
    VOYAGE_API_KEY: z.string().optional(),
    EMBEDDING_MODEL: z.string().default("voyage-3.5-lite"),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
  })
  .superRefine((e, ctx) => {
    if (e.MOCK_MODE) return;
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const) {
      if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when MOCK_MODE=false" });
    }
  });

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Parsed env. Throws listing missing names (never values). */
export function env(): Env {
  return (cached ??= schema.parse(process.env));
}

/** Mock login is allowed only in mock mode and never in a production build. */
export const mockAuthAllowed = () => env().MOCK_MODE && env().NODE_ENV !== "production";

/** Fetches a secret by name only when a real call needs it. */
export function secret(name: "ANTHROPIC_API_KEY" | "VOYAGE_API_KEY" | "WHATSAPP_APP_SECRET" | "WHATSAPP_VERIFY_TOKEN"): string {
  const v = env()[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
