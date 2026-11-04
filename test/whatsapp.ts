import { createHmac } from "node:crypto";

/** Builds a signed Meta webhook request for tests (secret matches vitest.config.ts). */
export function waRequest(body: unknown, secret = "test-app-secret") {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } });
}

export const waMessage = (id: string, from: string, text: string, phoneNumberId = "mock-phone-sunrise", name = "Test User") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: from, profile: { name } }],
    messages: [{ id, from, type: "text", text: { body: text } }],
  } }] }],
});

export const waStatus = (id: string, status: string, phoneNumberId = "mock-phone-sunrise") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id, status }] } }] }],
});
