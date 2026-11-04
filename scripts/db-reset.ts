import { resetLocalDb } from "../lib/db-reset.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
await resetLocalDb(url);
console.log("local database reset and seeded");
