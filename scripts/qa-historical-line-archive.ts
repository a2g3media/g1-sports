import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeHistoricalSport,
  normalizeHistoricalStatType,
} from "../src/shared/historicalStatTypeRegistry";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runRegistryChecks(): void {
  assert(normalizeHistoricalSport("nba") === "NBA", "sport normalization failed for NBA");
  assert(normalizeHistoricalSport("ufc") === "MMA", "sport normalization failed for MMA");
  assert(
    normalizeHistoricalStatType({ sport: "NHL", statType: "Shots on Goal" }) === "shots_on_goal",
    "stat normalization failed for NHL shots on goal"
  );
  assert(
    normalizeHistoricalStatType({ sport: "NBA", marketType: "Points + Rebounds + Assists" }) === "pra",
    "stat normalization failed for NBA PRA"
  );
}

function runSchemaGuardrailChecks(): void {
  const migration = readFileSync(join(process.cwd(), "migrations/96.sql"), "utf8");
  assert(
    migration.includes("trg_hist_snapshots_block_update") && migration.includes("trg_hist_snapshots_block_delete"),
    "append-only triggers missing on historical_prop_snapshots"
  );
  assert(
    migration.includes("idx_hist_verified_unique") && migration.includes("idx_hist_grades_unique"),
    "unique indexes missing for verified lines and grades"
  );
}

function runVerifiedOnlyReadPathChecks(): void {
  const playerRoute = readFileSync(join(process.cwd(), "src/worker/routes/player-profile.ts"), "utf8");
  assert(
    playerRoute.includes("readVerifiedLinesForPlayerGame"),
    "player profile route is not wired to historical_verified_lines reader"
  );
  assert(
    playerRoute.includes('lineSource: hasAny ? "historical_verified" : "unavailable"'),
    "player profile route is not marking verified-only line source"
  );
}

async function main(): Promise<void> {
  runRegistryChecks();
  runSchemaGuardrailChecks();
  runVerifiedOnlyReadPathChecks();
  console.log("historical-line-archive QA checks passed");
}

main().catch((error) => {
  console.error("historical-line-archive QA checks failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
