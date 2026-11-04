import { beforeAll } from "vitest";
import { resetLocalDb } from "../lib/db-reset.ts";

// Every test file starts from a freshly seeded local database.
beforeAll(() => resetLocalDb(process.env.DATABASE_URL!));
