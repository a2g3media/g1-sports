import { spawnSync } from "node:child_process";

type ReleaseCheck = {
  id: string;
  command: string;
  allowRateLimitWarning?: boolean;
};

type ReleaseResult = {
  id: string;
  ok: boolean;
  warning: boolean;
  exitCode: number;
  durationMs: number;
  note: string;
};

const checks: ReleaseCheck[] = [
  { id: "evaluators", command: "npm run qa:pools:evaluators" },
  { id: "ui-contract", command: "npm run qa:pools:ui" },
  { id: "api-contract", command: "npm run qa:pools:api" },
  { id: "join-contract", command: "npm run qa:pools:join" },
  { id: "pools-smoke", command: "npm run smoke:pools" },
  { id: "routes-deep", command: "npm run smoke:routes:deep", allowRateLimitWarning: true },
];

function hasRateLimitWarning(output: string): boolean {
  return output.includes("READY_WITH_RATE_LIMIT_WARNINGS") || output.includes("BLOCKED_RATE_LIMIT");
}

function runCheck(check: ReleaseCheck): ReleaseResult {
  const started = Date.now();
  const proc = spawnSync(check.command, {
    shell: true,
    encoding: "utf8",
    stdio: "pipe",
  });
  const durationMs = Date.now() - started;
  const output = `${proc.stdout || ""}\n${proc.stderr || ""}`;
  const exitCode = proc.status ?? 1;

  if (exitCode === 0) {
    const warning = !!check.allowRateLimitWarning && hasRateLimitWarning(output);
    return {
      id: check.id,
      ok: true,
      warning,
      exitCode,
      durationMs,
      note: warning ? "pass with external rate-limit warning" : "pass",
    };
  }

  if (check.allowRateLimitWarning && hasRateLimitWarning(output)) {
    return {
      id: check.id,
      ok: true,
      warning: true,
      exitCode,
      durationMs,
      note: "pass with external rate-limit warning",
    };
  }

  return {
    id: check.id,
    ok: false,
    warning: false,
    exitCode,
    durationMs,
    note: "failed",
  };
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  console.log("=== Pools Release Summary ===");
  const results: ReleaseResult[] = [];

  for (const check of checks) {
    console.log(`\n[run] ${check.id} -> ${check.command}`);
    const result = runCheck(check);
    results.push(result);
    console.log(
      `[${result.ok ? (result.warning ? "WARN" : "PASS") : "FAIL"}] ${result.id} (${formatMs(result.durationMs)}) - ${result.note}`,
    );
    if (!result.ok) {
      console.error(`\nStopping early on failure: ${result.id}`);
      break;
    }
  }

  const passed = results.filter((r) => r.ok && !r.warning).length;
  const warned = results.filter((r) => r.ok && r.warning).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log("\n=== Release Verdict ===");
  console.log(`PASS: ${passed}`);
  console.log(`WARN: ${warned}`);
  console.log(`FAIL: ${failed}`);
  console.log(`DURATION: ${formatMs(totalMs)}`);

  if (failed > 0) {
    console.log("VERDICT: BLOCKED");
    process.exit(1);
  }
  if (warned > 0) {
    console.log("VERDICT: READY_WITH_WARNINGS");
    process.exit(0);
  }
  console.log("VERDICT: READY");
}

main();
