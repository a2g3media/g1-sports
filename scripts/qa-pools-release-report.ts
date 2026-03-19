import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

type ReleaseCheck = {
  id: string;
  command: string;
  allowRateLimitWarning?: boolean;
};

type ReleaseResult = {
  id: string;
  command: string;
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

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function nowStamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
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
      command: check.command,
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
      command: check.command,
      ok: true,
      warning: true,
      exitCode,
      durationMs,
      note: "pass with external rate-limit warning",
    };
  }

  return {
    id: check.id,
    command: check.command,
    ok: false,
    warning: false,
    exitCode,
    durationMs,
    note: "failed",
  };
}

function toVerdict(results: ReleaseResult[]): "READY" | "READY_WITH_WARNINGS" | "BLOCKED" {
  if (results.some((r) => !r.ok)) return "BLOCKED";
  if (results.some((r) => r.warning)) return "READY_WITH_WARNINGS";
  return "READY";
}

function buildReport(results: ReleaseResult[], startedAt: Date): string {
  const passCount = results.filter((r) => r.ok && !r.warning).length;
  const warnCount = results.filter((r) => r.ok && r.warning).length;
  const failCount = results.filter((r) => !r.ok).length;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const verdict = toVerdict(results);

  const lines: string[] = [];
  lines.push("# Pools Release Report");
  lines.push("");
  lines.push(`- Started at: ${startedAt.toISOString()}`);
  lines.push(`- Total duration: ${formatMs(totalDurationMs)}`);
  lines.push(`- PASS: ${passCount}`);
  lines.push(`- WARN: ${warnCount}`);
  lines.push(`- FAIL: ${failCount}`);
  lines.push(`- Verdict: **${verdict}**`);
  lines.push("");
  lines.push("## Check Results");
  lines.push("");
  for (const r of results) {
    const status = r.ok ? (r.warning ? "WARN" : "PASS") : "FAIL";
    lines.push(`- [${status}] \`${r.id}\` (${formatMs(r.durationMs)}) - ${r.note}`);
    lines.push(`  - Command: \`${r.command}\``);
  }
  lines.push("");
  lines.push("## Next Action");
  if (verdict === "BLOCKED") {
    lines.push("- Fix failed checks and rerun `npm run qa:pools:release:report`.");
  } else if (verdict === "READY_WITH_WARNINGS") {
    lines.push("- Proceed with release; monitor external provider rate-limit warnings.");
  } else {
    lines.push("- Proceed with release.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const startedAt = new Date();
  const stamp = nowStamp(startedAt);
  const reportDir = resolve("docs/release-reports");
  mkdirSync(reportDir, { recursive: true });

  console.log("=== Pools Release Report Generator ===");
  const results: ReleaseResult[] = [];
  for (const check of checks) {
    console.log(`[run] ${check.id} -> ${check.command}`);
    const result = runCheck(check);
    results.push(result);
    console.log(`[${result.ok ? (result.warning ? "WARN" : "PASS") : "FAIL"}] ${result.id} (${formatMs(result.durationMs)})`);
    if (!result.ok) {
      console.error(`Stopping early due to failure: ${result.id}`);
      break;
    }
  }

  const report = buildReport(results, startedAt);
  const stampedPath = resolve(reportDir, `pools-release-${stamp}.md`);
  const latestPath = resolve(reportDir, "latest-pools-release.md");
  writeFileSync(stampedPath, report, "utf8");
  writeFileSync(latestPath, report, "utf8");

  const verdict = toVerdict(results);
  console.log(`\nReport written: ${stampedPath}`);
  console.log(`Latest alias: ${latestPath}`);
  console.log(`Verdict: ${verdict}`);

  if (verdict === "BLOCKED") process.exit(1);
}

main();
