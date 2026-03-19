type ContractCheck = {
  id: string;
  path: string;
  headers?: Record<string, string>;
  allowedStatuses: number[];
  requiredKeysOn200?: string[];
};

let baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8787";
const HEALTH_PATH = "/api/health/sportsradar";
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

function hasPath(obj: unknown, dottedPath: string): boolean {
  if (!obj || typeof obj !== "object") return false;
  let cur: unknown = obj;
  for (const part of dottedPath.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }
  return true;
}

async function fetchJson(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function resolveBaseUrl(): Promise<string> {
  for (const base of BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}${HEALTH_PATH}`, {
        headers: { "X-Demo-Mode": "true" },
      });
      if (res.ok) return base;
    } catch {
      // keep probing
    }
  }
  throw new Error(`No local server reachable. Tried: ${BASE_CANDIDATES.join(", ")}`);
}

const checks: ContractCheck[] = [
  {
    id: "admin-my-pools",
    path: "/api/pool-admin/my-pools",
    headers: { "X-Demo-Mode": "true" },
    allowedStatuses: [200],
    requiredKeysOn200: ["pools", "totals"],
  },
  {
    id: "marketplace-pools",
    path: "/api/marketplace/pools",
    allowedStatuses: [200, 401, 403],
    requiredKeysOn200: ["pools", "categories", "featured"],
  },
  {
    id: "marketplace-commissioner-me",
    path: "/api/marketplace/commissioners/me",
    allowedStatuses: [200, 401],
    requiredKeysOn200: ["user_id", "display_name", "rating_avg", "rating_count"],
  },
  {
    id: "pool-admin-join-requirements",
    path: "/api/pool-admin/1/join-requirements",
    allowedStatuses: [200, 401, 403],
    requiredKeysOn200: [
      "league_id",
      "joinApprovalRequired",
      "requireJoinEmail",
      "requireJoinPhone",
      "joinAutoApproveWhenProfileComplete",
      "joinNotifyAdminsOnRequest",
      "joinNotifyUsersOnStatusChange",
    ],
  },
];

async function main() {
  const resolvedBase = await resolveBaseUrl();
  console.log(`Using base URL: ${resolvedBase}`);
  baseUrl = resolvedBase;
  console.log("=== Pools API Contract Gates ===");
  let pass = 0;
  for (const check of checks) {
    const result = await fetchJson(check.path, check.headers);
    if (!check.allowedStatuses.includes(result.status)) {
      throw new Error(`${check.id} returned HTTP ${result.status}; allowed ${check.allowedStatuses.join(",")}`);
    }
    if (result.status === 200 && check.requiredKeysOn200) {
      for (const key of check.requiredKeysOn200) {
        if (!hasPath(result.json, key)) {
          throw new Error(`${check.id} missing key "${key}" on HTTP 200 payload`);
        }
      }
    }
    pass += 1;
    console.log(`PASS ${check.id} (HTTP ${result.status})`);
  }
  console.log(`API contract gates passed: ${pass}/${checks.length}`);
}

main().catch((err) => {
  console.error("API contract gates failed:", err);
  process.exit(1);
});
