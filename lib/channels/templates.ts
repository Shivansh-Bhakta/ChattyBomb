import { z } from "zod";
import type { TemplateCategory } from "./types.ts";

/** Approved WhatsApp templates the business registered with Meta, kept in channels.config.templates. */
export const templateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/, "lowercase letters, digits and _ only"),
  language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "language code like en or en_US"),
  category: z.enum(["marketing", "utility", "authentication"]),
});
export type Template = z.infer<typeof templateSchema> & { category: TemplateCategory };

export const templatesOf = (config: unknown): Template[] =>
  z.array(templateSchema).catch([]).parse((config as { templates?: unknown } | null)?.templates);

/** Parses the settings textarea: one "name,language,category" per line. */
export function parseTemplateLines(text: string): Template[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, language, category] = l.split(",").map((x) => x.trim());
    return templateSchema.parse({ name, language, category });
  });
}
