import { existsSync, readFileSync } from "node:fs";
import coachgRouter from "../src/worker/routes/coachg-intelligence";
import mmaRouter from "../src/worker/routes/mma";
import golfRouter from "../src/worker/routes/golf";
import apiHealthRouter from "../src/worker/routes/api-health";

type EnvMap = Record<string, any>;
type CheckState = "PASS" | "BLOCKED_CONFIG" | "BLOCKED_RATE_LIMIT" | "FAIL";
type CheckResult = Awaited<ReturnType<typeof hit>>;

function parseDotEnv(path: string): EnvMap {
  const out: EnvMap = {};
  if (!existsSync(path)) return out;
  const txt = readFileSync(path, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

class MockStmt {
  bind() {
    return this;
  }
  async first() {
    return null;
  }
  async all() {
    return { results: [] as any[] };
  }
  async run() {
    return { success: true };
  }
}

const mockDb = {
  prepare() {
    return new MockStmt();
  },
};

const envFromFile = parseDotEnv(".dev.vars");
const env: EnvMap = { ...envFromFile, DB: mockDb };
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

async function hit(
  router: { fetch: (req: Request, env: any, ctx: any) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const req = new Request(`http://local${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await router.fetch(req, env, ctx);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
}

function getErrorMessage(result: CheckResult): string {
  if (result.json && typeof result.json?.error === "string") return result.json.error;
  if (!result.ok && typeof result.text === "string" && result.text.trim().length > 0) {
    return result.text.slice(0, 180);
  }
  return "";
}

function classifyResult(name: string, result: CheckResult): CheckState {
  const error = getErrorMessage(result).toLowerCase();
  const code =
    result.json && typeof result.json?.error_code === "string"
      ? result.json.error_code.toLowerCase()
      : "";

  if (result.ok) {
    // Health endpoints can return 200 with embedded FAIL states.
    if (name.includes("api health openai") && result.json?.status === "FAIL") {
      return error.includes("not configured") ? "BLOCKED_CONFIG" : "FAIL";
    }
    if (name.includes("api health sportsdata") && result.json?.apiKeyPresent === false) {
      return "BLOCKED_CONFIG";
    }
    return "PASS";
  }

  if (result.status === 429 || error.includes("rate limited")) return "BLOCKED_RATE_LIMIT";
  if (result.status === 503 || code.includes("missing") || error.includes("not configured")) {
    return "BLOCKED_CONFIG";
  }
  return "FAIL";
}

async function main() {
  const checks: Array<[string, CheckResult]> = [];
  const deepMode = process.env.SMOKE_DEEP === "1";

  checks.push([
    "coachg intelligence",
    await hit(
      coachgRouter,
      "GET",
      "/intelligence?surface=home&q=daily%20brief",
      undefined,
      { "x-user-id": "smoke-user-1" }
    ),
  ]);
  checks.push([
    "coachg daily brief",
    await hit(coachgRouter, "GET", "/daily-brief", undefined, {
      "x-user-id": "smoke-user-1",
    }),
  ]);
  checks.push([
    "coachg chat",
    await hit(
      coachgRouter,
      "POST",
      "/chat",
      { message: "Give me a sharp radar scan for today" },
      { "x-user-id": "smoke-user-1" }
    ),
  ]);

  const mmaNext = await hit(mmaRouter, "GET", "/next");
  checks.push(["mma next", mmaNext]);
  if (deepMode) {
    checks.push(["mma schedule", await hit(mmaRouter, "GET", "/schedule?days=10")]);
  }
  if (mmaNext.ok && mmaNext.json?.eventId) {
    checks.push([
      "mma event live",
      await hit(mmaRouter, "GET", `/event/${mmaNext.json.eventId}`),
    ]);
  }

  const golfCurrent = await hit(golfRouter, "GET", "/current");
  checks.push(["golf current", golfCurrent]);
  if (deepMode) {
    checks.push(["golf schedule", await hit(golfRouter, "GET", "/schedule")]);
  }
  if (golfCurrent.ok && golfCurrent.json?.id) {
    checks.push([
      "golf leaderboard live",
      await hit(golfRouter, "GET", `/leaderboard/${golfCurrent.json.id}`),
    ]);
  }

  checks.push([
    "api health all (demo)",
    await hit(apiHealthRouter, "GET", "/all", undefined, {
      "X-Demo-Mode": "true",
    }),
  ]);
  checks.push([
    "api health openai (demo)",
    await hit(apiHealthRouter, "GET", "/openai", undefined, {
      "X-Demo-Mode": "true",
    }),
  ]);

  const counts: Record<CheckState, number> = {
    PASS: 0,
    BLOCKED_CONFIG: 0,
    BLOCKED_RATE_LIMIT: 0,
    FAIL: 0,
  };

  console.log("=== Route Smoke Results ===");
  for (const [name, res] of checks) {
    const state = classifyResult(name, res);
    counts[state] += 1;
    const keys =
      res.json && typeof res.json === "object"
        ? Object.keys(res.json).slice(0, 8).join(",")
        : "non-json";
    const err = getErrorMessage(res);
    const errChunk = err ? ` | error: ${err}` : "";
    console.log(`${name} => ${state} (HTTP ${res.status}) | keys: ${keys}${errChunk}`);
  }

  console.log("");
  console.log("=== Launch Gate Summary ===");
  console.log(`PASS: ${counts.PASS}`);
  console.log(`BLOCKED_CONFIG: ${counts.BLOCKED_CONFIG}`);
  console.log(`BLOCKED_RATE_LIMIT: ${counts.BLOCKED_RATE_LIMIT}`);
  console.log(`FAIL: ${counts.FAIL}`);

  let verdict = "READY";
  if (counts.FAIL > 0) verdict = "NO_GO_BLOCKED_BY_FAILURES";
  else if (counts.BLOCKED_CONFIG > 0) verdict = "NO_GO_BLOCKED_BY_CONFIG";
  else if (counts.BLOCKED_RATE_LIMIT > 0) verdict = "READY_WITH_RATE_LIMIT_WARNINGS";

  console.log(`VERDICT: ${verdict}`);

  if (verdict.startsWith("NO_GO")) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Smoke script failed:", err);
  process.exit(1);
});
