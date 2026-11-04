import { afterAll, describe, expect, it } from "vitest";
import { asUser, closePool } from "./db.ts";
import { getThread, listConversations } from "./inbox.ts";
import { A_OWNER, CONV_A2, CONV_B1 } from "../test/ids.ts";

afterAll(closePool);

describe("inbox queries", () => {
  it("filters by status and searches message text", async () => {
    await asUser(A_OWNER, async (db) => {
      expect((await listConversations(db, { status: "needs_human" })).map((r) => r.id)).toEqual([CONV_A2]);
      expect((await listConversations(db, { q: "refund" })).map((r) => r.id)).toEqual([CONV_A2]);
      expect(await listConversations(db, { q: "Haircut" })).toEqual([]); // tenant B's text
    });
  });

  it("returns null for another tenant's thread", async () => {
    expect(await asUser(A_OWNER, (db) => getThread(db, CONV_B1))).toBeNull();
  });
});
