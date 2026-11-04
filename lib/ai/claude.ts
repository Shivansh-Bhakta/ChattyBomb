import Anthropic from "@anthropic-ai/sdk";
import { secret } from "../env.ts";

let client: Anthropic | undefined;
export const claude = () => (client ??= new Anthropic({ apiKey: secret("ANTHROPIC_API_KEY"), maxRetries: 2, timeout: 60_000 }));

export type Usage = { model: string; usage: Anthropic.Usage } | null;
