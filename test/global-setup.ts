import { resetLocalDb } from "../lib/db-reset.ts";

export default async function setup() {
  await resetLocalDb(process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/chattybomb_test");
}
