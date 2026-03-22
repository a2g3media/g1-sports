type SmokeCheck = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  // Accept auth-gated responses in local environments without session cookies.
  allowedStatuses?: number[];
};

// Avoid health routes that may touch optional provider tables in local/dev.
const HEALTH_PATH = "/api/pool-admin/my-pools";
const BASE_CANDIDATES = [
  process.env.SMOKE_BASE_URL,
  process.env.MONITOR_BASE_URL,
  "http://127.0.0.1:8787",
  "http://localhost:8787",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
]
  .filter(Boolean) as string[];

async function resolveBaseUrl(): Promise<string> {
  for (const base of BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}${HEALTH_PATH}`, {
        headers: { "X-Demo-Mode": "true" },
      });
      // A non-5xx response proves the local server is reachable even if
      // health route permissions/config differ by environment.
      if (res.status < 500) return base;
    } catch {
      // keep probing
    }
  }
  throw new Error(
    `No local server reachable. Tried: ${BASE_CANDIDATES.join(", ")}`
  );
}

const checks: SmokeCheck[] = [
  {
    id: "pool-admin-my-pools-demo",
    method: "GET",
    path: "/api/pool-admin/my-pools",
    headers: { "X-Demo-Mode": "true" },
    allowedStatuses: [200],
  },
  {
    id: "marketplace-pools",
    method: "GET",
    path: "/api/marketplace/pools",
    allowedStatuses: [200, 401, 403],
  },
  {
    id: "marketplace-commissioner-me",
    method: "GET",
    path: "/api/marketplace/commissioners/me",
    allowedStatuses: [200, 401],
  },
  {
    id: "pool-admin-event-map",
    method: "GET",
    path: "/api/pool-admin/1/event-map?period_id=Week%201",
    allowedStatuses: [200, 401, 403],
  },
  {
    id: "pool-admin-marketplace-listing",
    method: "GET",
    path: "/api/pool-admin/1/marketplace-listing",
    allowedStatuses: [200, 401, 403],
  },
  {
    id: "pool-admin-join-requirements",
    method: "GET",
    path: "/api/pool-admin/1/join-requirements",
    allowedStatuses: [200, 401, 403],
  },
];

function toErrorText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  return typeof obj.error === "string" ? obj.error : "";
}

async function runCheck(
  baseUrl: string,
  check: SmokeCheck
): Promise<{ id: string; status: number; pass: boolean; detail: string }> {
  const res = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: {
      "content-type": "application/json",
      ...(check.headers || {}),
    },
    body: check.body ? JSON.stringify(check.body) : undefined,
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const allowed = check.allowedStatuses || [200];
  const pass = allowed.includes(res.status) && res.status < 500;
  return {
    id: check.id,
    status: res.status,
    pass,
    detail: toErrorText(payload) || text.slice(0, 160),
  };
}

async function main() {
  const baseUrl = await resolveBaseUrl();
  console.log(`Using base URL: ${baseUrl}`);
  const results = await Promise.all(checks.map((check) => runCheck(baseUrl, check)));
  console.log("=== Pools Smoke ===");
  for (const r of results) {
    console.log(`${r.id}: ${r.pass ? "PASS" : "FAIL"} (HTTP ${r.status})${r.detail ? ` | ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.error(`Pools smoke failed (${failed.length} checks).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Pools smoke script failed:", err);
  process.exit(1);
});
