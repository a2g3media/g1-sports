import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ContractGate = {
  id: string;
  file: string;
  includes: string[];
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function fileText(relPath: string): string {
  return readFileSync(resolve(relPath), "utf8");
}

const gates: ContractGate[] = [
  {
    id: "pool-admin-join-requirements-and-notification-rules",
    file: "src/worker/routes/pool-admin.ts",
    includes: [
      "joinAutoApproveWhenProfileComplete",
      "joinNotifyAdminsOnRequest",
      "joinNotifyUsersOnStatusChange",
      'poolAdminRouter.patch("/:leagueId/join-requirements"',
    ],
  },
  {
    id: "join-flow-notification-enforcement",
    file: "src/worker/index.ts",
    includes: [
      "const joinNotifyAdminsOnRequest = parsedRules.joinNotifyAdminsOnRequest !== false;",
      "const joinNotifyUsersOnStatusChange = parsedRules.joinNotifyUsersOnStatusChange !== false;",
      "if (joinNotifyAdminsOnRequest)",
      "if (joinNotifyUsersOnStatusChange)",
    ],
  },
  {
    id: "pool-admin-settings-join-toggle-ui",
    file: "src/react-app/pages/pool-admin/PoolAdminSettings.tsx",
    includes: [
      "Notify Admins On New Requests",
      "Notify Users On Status Changes",
      "Current behavior preview:",
      "joinNotificationPreview",
    ],
  },
  {
    id: "join-page-approval-user-copy",
    file: "src/react-app/pages/JoinLeague.tsx",
    includes: [
      "Commissioner approval required",
      "Auto-approval enabled when required profile fields are complete",
      "pending_approval",
    ],
  },
];

async function main() {
  console.log("=== Pools Join Workflow Contract Gates ===");
  let pass = 0;
  for (const gate of gates) {
    const text = fileText(gate.file);
    for (const token of gate.includes) {
      assert(text.includes(token), `${gate.id} missing token: ${token}`);
    }
    pass += 1;
    console.log(`PASS ${gate.id}`);
  }
  console.log(`Join workflow contract gates passed: ${pass}/${gates.length}`);
}

main().catch((err) => {
  console.error("Join workflow contract gates failed:", err);
  process.exit(1);
});
