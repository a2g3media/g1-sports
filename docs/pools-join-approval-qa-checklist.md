# Pools Join Approval QA Checklist

Use this checklist for final validation of join rules, approvals, and notification behavior.

## Setup

- Environment: local app running at `http://localhost:5173`
- Feature flags: `PUBLIC_POOLS=ON`, `MARKETPLACE_ENABLED=ON`
- Roles:
  - Commissioner account (owner/admin of pool)
  - Joiner account A (missing phone/email as needed)
  - Joiner account B (profile complete)
- Pool under test: one private pool with invite code

## Scenario Matrix (Core 6)

1. Approval OFF, user notifications ON
   - Configure:
     - `Require Commissioner Approval = OFF`
     - `Notify Users On Status Changes = ON`
   - Join result:
     - User joins immediately.
     - No pending request card in members page.
   - Verify:
     - `JoinLeague` success message is "You're in!"
     - Member appears as `joined`

2. Approval ON, auto-approve OFF
   - Configure:
     - `Require Commissioner Approval = ON`
     - `Auto-Approve If Profile Complete = OFF`
   - Join result:
     - User lands in `pending_approval`.
   - Verify:
     - Pending request appears in `PoolAdminMembers`
     - Approve/Reject actions available

3. Approval ON, auto-approve ON, profile complete
   - Configure:
     - `Require Commissioner Approval = ON`
     - `Auto-Approve If Profile Complete = ON`
     - Required fields set to match joiner profile completeness
   - Join result:
     - Auto-join to `joined` (no pending state)
   - Verify:
     - No pending request row created
     - Joiner can access pool immediately

4. Required email enforced
   - Configure:
     - `Require Email = ON`
   - Join result:
     - Join blocked until email provided.
   - Verify:
     - `JoinLeague` shows required profile input
     - API returns validation error if missing

5. Required phone enforced
   - Configure:
     - `Require Phone Number = ON`
   - Join result:
     - Join blocked until phone provided.
   - Verify:
     - `JoinLeague` shows required profile input
     - API returns validation error if missing

6. Notification toggle behavior
   - Configure A:
     - `Notify Admins On New Requests = OFF`
     - `Notify Users On Status Changes = ON`
   - Expected:
     - No admin join-request notifications
     - User still gets submitted/approved/rejected notifications
   - Configure B:
     - `Notify Admins On New Requests = ON`
     - `Notify Users On Status Changes = OFF`
   - Expected:
     - Admin gets request alerts
     - User gets no workflow status notifications

## Bulk Actions Validation

- Create at least 3 pending requests.
- Use `Approve All`.
  - All pending move to `joined`
  - No leftover pending rows
- Recreate pending requests and use `Reject All`.
  - All pending move to `removed`
  - Status badges and counts update immediately

## UI/UX Acceptance

- Pool admin settings show:
  - all 6 join/notification toggles
  - "Current behavior preview" text updates in real time
- Members page shows:
  - Pending requests tab and counts
  - Join Requests card with bulk actions
- Join page shows:
  - dynamic requirements text
  - pending-approval messaging when applicable

## Pass/Fail Criteria

Pass only if all are true:

- No mismatch between configured rules and runtime behavior
- No unauthorized access to pool content while pending
- Notification behavior exactly matches toggle state
- No UI stale state after save/reload/navigation
- No console errors in join/admin/member flows

## Execution Format (Team)

- Tester records each scenario as: `PASS` / `FAIL` + screenshot + timestamp
- For failures include:
  - user role
  - pool id
  - exact toggle state
  - expected vs actual
  - network response snippet
