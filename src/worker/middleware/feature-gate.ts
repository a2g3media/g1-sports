/**
 * Feature Gate Middleware
 * 
 * Middleware to check if user has access to specific premium features.
 * Returns 403 if user doesn't have the required feature.
 */

import { MiddlewareHandler } from "hono";
import { userHasFeature, type FeatureAccess } from "../services/subscriptionService";

/**
 * Create middleware to check if user has a specific feature
 */
export function requireFeature(
  featureKey: keyof FeatureAccess
): MiddlewareHandler<{
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    userId: string;
  };
}> {
  return async (c, next) => {
    const userId = c.get("userId");
    
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hasFeature = await userHasFeature(
      c.env.DB, 
      userId, 
      (features) => !!features[featureKey]
    );

    if (!hasFeature) {
      return c.json(
        {
          error: "Feature not available",
          message: `This feature requires ${String(featureKey)} access. Please upgrade your subscription.`,
          requiredFeature: String(featureKey),
        },
        403
      );
    }

    await next();
  };
}
