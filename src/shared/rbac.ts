import { z } from "zod";

// =====================================================
// ROLE-BASED ACCESS CONTROL (RBAC) TYPES
// =====================================================

/**
 * Platform roles - hierarchical access levels
 * - super_admin: Platform owner, full control plane access
 * - pool_admin: League/pool managers, can manage their pools
 * - player: Regular users, can join and participate in pools
 */
export const PlatformRoleEnum = z.enum([
  "super_admin",
  "pool_admin", 
  "player",
]);
export type PlatformRole = z.infer<typeof PlatformRoleEnum>;

// Role hierarchy (higher index = more access)
export const ROLE_HIERARCHY: PlatformRole[] = ["player", "pool_admin", "super_admin"];

// Super Admin route prefixes - only super_admin can access
export const SUPER_ADMIN_ROUTES = [
  "/api/admin",
  "/admin",
];

// Pool Admin route prefixes
export const POOL_ADMIN_ROUTES = [
  "/api/leagues/:id/admin",
];

/**
 * Check if a role has at least the required access level
 */
export function hasMinimumRole(userRoles: string[], requiredRole: PlatformRole): boolean {
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  
  // Parse user roles (stored as JSON array string)
  let roles: string[] = [];
  if (Array.isArray(userRoles)) {
    roles = userRoles;
  } else if (typeof userRoles === "string") {
    try {
      roles = JSON.parse(userRoles);
    } catch {
      roles = [userRoles];
    }
  }
  
  // Check if any user role meets the minimum
  return roles.some(role => {
    const roleIndex = ROLE_HIERARCHY.indexOf(role as PlatformRole);
    return roleIndex >= requiredIndex;
  });
}

/**
 * Check if user has a specific role
 */
export function hasRole(userRoles: string[], role: PlatformRole): boolean {
  let roles: string[] = [];
  if (Array.isArray(userRoles)) {
    roles = userRoles;
  } else if (typeof userRoles === "string") {
    try {
      roles = JSON.parse(userRoles);
    } catch {
      roles = [userRoles];
    }
  }
  
  return roles.includes(role);
}

/**
 * Check if user is a super admin
 */
export function isSuperAdmin(userRoles: string[] | string | null | undefined): boolean {
  if (!userRoles) return false;
  return hasRole(Array.isArray(userRoles) ? userRoles : [userRoles], "super_admin");
}

/**
 * Parse roles from database (stored as JSON string)
 */
export function parseRoles(rolesValue: unknown): PlatformRole[] {
  if (!rolesValue) return ["player"];
  
  if (Array.isArray(rolesValue)) {
    return rolesValue.filter(r => ROLE_HIERARCHY.includes(r as PlatformRole)) as PlatformRole[];
  }
  
  if (typeof rolesValue === "string") {
    try {
      const parsed = JSON.parse(rolesValue);
      if (Array.isArray(parsed)) {
        return parsed.filter(r => ROLE_HIERARCHY.includes(r as PlatformRole)) as PlatformRole[];
      }
    } catch {
      if (ROLE_HIERARCHY.includes(rolesValue as PlatformRole)) {
        return [rolesValue as PlatformRole];
      }
    }
  }
  
  return ["player"];
}

/**
 * Get the highest role from a list of roles
 */
export function getHighestRole(roles: PlatformRole[]): PlatformRole {
  let highest: PlatformRole = "player";
  let highestIndex = 0;
  
  for (const role of roles) {
    const index = ROLE_HIERARCHY.indexOf(role);
    if (index > highestIndex) {
      highestIndex = index;
      highest = role;
    }
  }
  
  return highest;
}

// =====================================================
// USER STATUS TYPES
// =====================================================

export const UserStatusEnum = z.enum([
  "active",
  "disabled",
  "suspended",
  "pending",
]);
export type UserStatus = z.infer<typeof UserStatusEnum>;

// =====================================================
// SUBSCRIPTION STATUS TYPES
// =====================================================

export const SubscriptionStatusEnum = z.enum([
  "free",
  "trial",
  "paid",
  "expired",
  "canceled",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

// =====================================================
// POOL TYPE STATUS
// =====================================================

export const PoolTypeStatusEnum = z.enum([
  "draft",
  "active",
  "deprecated",
]);
export type PoolTypeStatus = z.infer<typeof PoolTypeStatusEnum>;

// =====================================================
// AUDIT EVENT TYPES
// =====================================================

export const AuditEntityTypeEnum = z.enum([
  "user",
  "pool",
  "pick",
  "receipt",
  "ledger",
  "pool_type",
  "system",
  "campaign",
  "notification",
  "feature_flag",
]);
export type AuditEntityType = z.infer<typeof AuditEntityTypeEnum>;

export const AuditActionTypeEnum = z.enum([
  // User actions
  "user_created",
  "user_updated",
  "user_disabled",
  "user_enabled",
  "user_role_changed",
  // Pool actions
  "pool_created",
  "pool_updated",
  "pool_archived",
  "pool_type_created",
  "pool_type_versioned",
  "pool_type_deprecated",
  // Payment actions
  "payment_verified",
  "payment_refunded",
  "payment_recorded",
  // System actions
  "setting_changed",
  "feature_flag_toggled",
  "campaign_created",
  "campaign_sent",
  // Read-only logs
  "admin_viewed_user",
  "admin_viewed_pool",
  "admin_viewed_ledger",
]);
export type AuditActionType = z.infer<typeof AuditActionTypeEnum>;

// =====================================================
// SUPER ADMIN DATA SCHEMAS
// =====================================================

// Platform settings
export const PlatformSettingSchema = z.object({
  id: z.number().optional(),
  setting_key: z.string(),
  setting_value: z.string().nullable(),
  setting_type: z.string().default("string"),
  description: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type PlatformSetting = z.infer<typeof PlatformSettingSchema>;

// Feature flag
export const FeatureFlagSchema = z.object({
  id: z.number().optional(),
  flag_key: z.string(),
  is_enabled: z.boolean().default(false),
  description: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// Pool type definition
export const PoolTypeSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  sport_key: z.string(),
  format_key: z.string(),
  version: z.string().default("v1"),
  status: PoolTypeStatusEnum.default("draft"),
  description: z.string().nullable(),
  allowed_settings_json: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type PoolType = z.infer<typeof PoolTypeSchema>;

// Marketing segment
export const MarketingSegmentSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  segment_key: z.string(),
  criteria_json: z.string().nullable(),
  user_count: z.number().default(0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type MarketingSegment = z.infer<typeof MarketingSegmentSchema>;

// Marketing campaign
export const MarketingCampaignSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  segment_id: z.number().nullable(),
  channel: z.string(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  status: z.string().default("draft"),
  scheduled_for: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type MarketingCampaign = z.infer<typeof MarketingCampaignSchema>;

// Notification delivery record
export const NotificationDeliverySchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  channel: z.string(),
  notification_type: z.string().nullable(),
  status: z.string().default("queued"),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  failed_at: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

// =====================================================
// OVERVIEW DASHBOARD TYPES
// =====================================================

export const PlatformHealthStatusEnum = z.enum([
  "OK",
  "DEGRADED",
  "DOWN",
]);
export type PlatformHealthStatus = z.infer<typeof PlatformHealthStatusEnum>;

export const PlatformOverviewSchema = z.object({
  // User counts
  totalUsers: z.number(),
  activeUsers7d: z.number(),
  
  // Pool counts
  totalPools: z.number(),
  activePools: z.number(),
  poolsBySport: z.array(z.object({
    sport: z.string(),
    count: z.number(),
  })),
  avgPoolSize: z.number(),
  
  // Subscription breakdown
  subscriptionBreakdown: z.object({
    free: z.number(),
    trial: z.number(),
    paid: z.number(),
    expired: z.number(),
  }),
  
  // Health indicators
  health: z.object({
    sportsDataFeeds: z.object({
      status: PlatformHealthStatusEnum,
      delayedCount: z.number(),
    }),
    pushNotifications: z.object({
      status: PlatformHealthStatusEnum,
      failureCount: z.number(),
    }),
    escrowWebhooks: z.object({
      status: PlatformHealthStatusEnum,
      failureCount: z.number(),
    }),
    appErrors: z.object({
      count24h: z.number(),
    }),
  }),
});
export type PlatformOverview = z.infer<typeof PlatformOverviewSchema>;
