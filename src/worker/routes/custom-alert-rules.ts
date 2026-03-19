/**
 * Custom Alert Rules API Routes
 * Elite-only endpoints for managing custom alert rules
 * 
 * Type Convention: All IDs are STRINGS (ruleId, userId)
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  createRule,
  updateRule,
  deleteRule,
  getUserRules,
  getRuleById,
  toggleRuleActive,
  duplicateRule,
  getRuleTriggerHistory,
  TRIGGER_TYPES,
  DOMINANT_PRESETS,
  getTriggerTypesForSport,
  getDominantPresetsForSport,
  type CreateRuleInput,
  type UpdateRuleInput,
} from "../services/customAlertRuleService";
import { getUserSubscription, getFeatureAccess } from "../services/subscriptionService";

const router = new Hono<{ Bindings: Env }>();

// Helper to check Elite access
async function checkEliteAccess(c: any): Promise<{ error: string; message?: string; status: 401 | 403 } | null> {
  const user = c.get("user");
  if (!user) return { error: "Unauthorized", status: 401 };
  
  const subscription = await getUserSubscription(c.env.DB, user.id);
  const features = getFeatureAccess(subscription.tier);

  if (!features.hasCustomAlerts) {
    return {
      error: "Elite subscription required",
      message: "Custom Alert Builder is an Elite-only feature",
      status: 403
    };
  }

  return null;
}

// Get all trigger types and presets
router.get("/config", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error, message: accessError.message }, accessError.status);
  }

  return c.json({
    triggerTypes: TRIGGER_TYPES,
    dominantPresets: DOMINANT_PRESETS,
  });
});

// Get trigger types for a specific sport
router.get("/config/sports/:sport", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const sport = c.req.param("sport");
  const triggerTypes = getTriggerTypesForSport(sport);
  const dominantPresets = getDominantPresetsForSport(sport);

  return c.json({
    triggerTypes,
    dominantPresets,
  });
});

// Get all user's rules
router.get("/", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const rules = await getUserRules(c.env.DB, user.id);
  return c.json({ rules });
});

// Get single rule
router.get("/:id", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const rule = await getRuleById(c.env.DB, user.id, ruleId);

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ rule });
});

// Create new rule
router.post("/", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json() as CreateRuleInput;
  const rule = await createRule(c.env.DB, user.id, body);

  return c.json({ rule }, 201);
});

// Update rule
router.patch("/:id", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const body = await c.req.json() as UpdateRuleInput;
  const rule = await updateRule(c.env.DB, user.id, ruleId, body);

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ rule });
});

// Toggle rule active/inactive
router.post("/:id/toggle", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const rule = await toggleRuleActive(c.env.DB, user.id, ruleId);

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ rule });
});

// Duplicate rule
router.post("/:id/duplicate", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const newRule = await duplicateRule(c.env.DB, user.id, ruleId);

  if (!newRule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({
    rule: newRule,
    message: `Created duplicate: ${newRule.name}`,
  });
});

// Delete rule
router.delete("/:id", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  await deleteRule(c.env.DB, user.id, ruleId);

  return c.json({ message: "Rule deleted" });
});

// Get rule trigger history
router.get("/:id/history", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const history = await getRuleTriggerHistory(c.env.DB, user.id, ruleId);

  return c.json({ history });
});

// Test rule with simulated trigger
router.post("/:id/test", authMiddleware, async (c) => {
  const accessError = await checkEliteAccess(c);
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status);
  }

  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const ruleId = c.req.param("id"); // STRING
  const rule = await getRuleById(c.env.DB, user.id, ruleId);

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  // Generate simulated trigger
  const simulated = generateSimulatedTrigger(rule.trigger_type);

  return c.json({
    ...simulated,
    rule: {
      id: rule.id,
      name: rule.name,
      trigger_type: rule.trigger_type,
    },
  });
});

// Helper: Generate simulated trigger for testing
function generateSimulatedTrigger(triggerType: string): {
  event: Record<string, unknown>;
  wouldTrigger: boolean;
  alertPreview: { headline: string; body: string };
  notes: string;
} {
  switch (triggerType) {
    case "SCORE_EVENT":
      return {
        event: {
          type: "touchdown",
          team: "KC",
          player: "Patrick Mahomes",
          score: { home: 14, away: 7 },
          quarter: 2,
          time: "8:42",
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Chiefs TD: Mahomes to Kelce",
          body: "KC leads 14-7 in Q2. Mahomes finds Kelce for a 23-yard TD.",
        },
        notes: "This is a simulated scoring event. Real alerts fire when actual games match your criteria.",
      };

    case "PERIOD_BREAK":
      return {
        event: {
          period: "halftime",
          score: { home: 21, away: 14 },
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Halftime: Chiefs 21, Raiders 14",
          body: "Chiefs control with strong 2nd quarter. Raiders need adjustments.",
        },
        notes: "Simulated period break. Real alerts generate summary commentary at halftime, end of quarters, etc.",
      };

    case "FINAL_SCORE":
      return {
        event: {
          finalScore: { home: 28, away: 24 },
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Final: Chiefs 28, Raiders 24",
          body: "Chiefs hold on for close win. Mahomes leads late drive.",
        },
        notes: "Simulated final score. Real alerts fire when games end.",
      };

    case "LINE_MOVEMENT":
      return {
        event: {
          market: "spread",
          from: -3.5,
          to: -5.5,
          movement: 2.0,
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Line Move: Chiefs -5.5 (was -3.5)",
          body: "2-point swing toward Chiefs. Heavy action on KC.",
        },
        notes: "Simulated line movement. Real alerts track significant odds shifts.",
      };

    case "INJURY":
      return {
        event: {
          player: "Travis Kelce",
          team: "KC",
          status: "questionable",
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Injury Update: Travis Kelce questionable",
          body: "Chiefs TE Travis Kelce questionable to return with ankle injury.",
        },
        notes: "Simulated injury report. Real alerts fire for major player updates.",
      };

    case "WEATHER":
      return {
        event: {
          condition: "rain",
          wind: 15,
          temperature: 42,
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Weather Alert: Rain, 15mph wind",
          body: "Wet conditions at Arrowhead. Passing game may be affected.",
        },
        notes: "Simulated weather change. Real alerts fire for significant weather impacts.",
      };

    case "DOMINANT_PERFORMANCE":
      return {
        event: {
          player: "Patrick Mahomes",
          stat: "350 passing yards, 4 TDs",
        },
        wouldTrigger: true,
        alertPreview: {
          headline: "Dominant: Mahomes 350 yds, 4 TDs",
          body: "Mahomes is carving up the Raiders defense. Elite performance.",
        },
        notes: "Simulated dominant performance. Real alerts detect exceptional stat lines.",
      };

    default:
      return {
        event: { type: "unknown" },
        wouldTrigger: false,
        alertPreview: {
          headline: "Test Alert",
          body: "This is a test alert for an unknown trigger type.",
        },
        notes: "Unknown trigger type. Configure a supported trigger to see real alerts.",
      };
  }
}

export { router as customAlertRulesRouter };
