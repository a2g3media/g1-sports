import { gamesRouter } from "../src/worker/routes/games";

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

const env = {
  DB: mockDb,
} as unknown as Env;

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function hit(path: string) {
  const req = new Request(`http://local${path}`);
  const res = await gamesRouter.fetch(req, env, ctx as any);
  const json = await res.json();
  return { status: res.status, json };
}

function assertSnapshotShape(payload: any) {
  assert(payload && typeof payload === "object", "snapshot payload must be an object");
  assert(payload.sport === "nascar", "snapshot sport must be nascar");
  assert(typeof payload.date === "string", "snapshot date must be a string");
  assert(typeof payload.source === "string", "snapshot source must be a string");
  assert(typeof payload.generated_at === "string", "snapshot generated_at must be a string");
  assert("live" in payload, "snapshot must include live key");
  assert("target" in payload, "snapshot must include target key");
}

async function main() {
  const base = await hit("/nascar/live-snapshot");
  assert(base.status === 200, `base snapshot status expected 200, got ${base.status}`);
  assertSnapshotShape(base.json);

  const withGameId = await hit("/nascar/live-snapshot?gameId=espn_nascar_fake");
  assert(withGameId.status === 200, `target snapshot status expected 200, got ${withGameId.status}`);
  assertSnapshotShape(withGameId.json);

  console.log("NASCAR live snapshot route shape test passed.");
}

main().catch((err) => {
  console.error("NASCAR live snapshot route shape test failed:", err);
  process.exit(1);
});
