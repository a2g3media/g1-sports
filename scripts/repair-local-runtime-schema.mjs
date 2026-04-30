import { spawnSync } from "node:child_process";

const DB_ID = "019ce56b-b0ff-7056-a2d5-613f9cde7650";
const ROOT_ARGS = ["wrangler", "d1", "execute", DB_ID, "--local"];

function runWrangler(args, options = {}) {
  const proc = spawnSync("npx", [...ROOT_ARGS, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  return proc;
}

function assertSuccess(proc, message) {
  if (proc.status !== 0) {
    throw new Error(message);
  }
}

function ensureColumn({
  table,
  column,
  type,
  successMessage,
  errorMessage,
}) {
  const addColumn = runWrangler([
    "--command",
    `ALTER TABLE ${table} ADD COLUMN ${column} ${type};`,
  ]);

  if (addColumn.status !== 0) {
    const errOutput = `${addColumn.stdout || ""}\n${addColumn.stderr || ""}`;
    const alreadyExists =
      errOutput.includes(`duplicate column name: ${column}`) ||
      errOutput.includes("duplicate column");
    if (!alreadyExists) {
      throw new Error(errorMessage);
    }
    console.log(`[local-runtime-repair] ${column} already exists on ${table}; continuing.`);
    return;
  }

  console.log(successMessage);
}

try {
  const baseRepair = runWrangler(["--file=migrations/local-runtime-stabilization.sql"]);
  assertSuccess(baseRepair, "Failed applying local runtime stabilization SQL");

  ensureColumn({
    table: "odds_opening",
    column: "opening_price_decimal",
    type: "REAL",
    successMessage: "[local-runtime-repair] Added opening_price_decimal to odds_opening.",
    errorMessage: "Failed adding opening_price_decimal to odds_opening",
  });

  ensureColumn({
    table: "odds_snapshots",
    column: "price_decimal",
    type: "REAL",
    successMessage: "[local-runtime-repair] Added price_decimal to odds_snapshots.",
    errorMessage: "Failed adding price_decimal to odds_snapshots",
  });

  console.log("[local-runtime-repair] Local schema stabilization completed.");
} catch (error) {
  console.error("[local-runtime-repair] Failed:", error);
  process.exit(1);
}
