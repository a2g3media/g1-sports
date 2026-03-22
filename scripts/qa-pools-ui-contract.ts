import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type UiGate = {
  id: string;
  file: string;
  includes: string[];
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const gates: UiGate[] = [
  {
    id: "pools-list-icon-and-marketplace",
    file: "src/react-app/pages/PoolsList.tsx",
    includes: ["PoolTypeBadgeIcon", "/api/marketplace/pools", "FEATURED"],
  },
  {
    id: "pool-hub-icon",
    file: "src/react-app/pages/PoolHub.tsx",
    includes: ["PoolTypeBadgeIcon", "format_key"],
  },
  {
    id: "create-league-icon-format-step",
    file: "src/react-app/pages/CreateLeague.tsx",
    includes: ["PoolTypeBadgeIcon", "Choose a pool type"],
  },
  {
    id: "pool-admin-settings-marketplace-controls",
    file: "src/react-app/pages/pool-admin/PoolAdminSettings.tsx",
    includes: ["marketplace-listing", "Commissioner Profile", "Listing Fee History"],
  },
];

function fileText(relPath: string): string {
  return readFileSync(resolve(relPath), "utf8");
}

async function main() {
  console.log("=== Pools UI Contract Gates ===");
  let pass = 0;
  for (const gate of gates) {
    const text = fileText(gate.file);
    for (const token of gate.includes) {
      assert(text.includes(token), `${gate.id} missing token: ${token}`);
    }
    pass += 1;
    console.log(`PASS ${gate.id}`);
  }
  console.log(`UI contract gates passed: ${pass}/${gates.length}`);
}

main().catch((err) => {
  console.error("UI contract gates failed:", err);
  process.exit(1);
});
