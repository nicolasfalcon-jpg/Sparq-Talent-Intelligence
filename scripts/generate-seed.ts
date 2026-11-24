// Writes supabase/seed.sql from the fictional fixtures. Run with `npm run db:seed:generate`.
// A test (tests/db/seed.test.ts) fails when the committed file is out of date.
import { writeFileSync } from "node:fs";
import { buildSeedSql } from "../src/data/seed/sql";

const target = new URL("../supabase/seed.sql", import.meta.url);
writeFileSync(target, buildSeedSql());
console.log(`wrote ${target.pathname}`);
