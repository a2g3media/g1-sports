import { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { parseRoles, hasRole, isSuperAdmin, type PlatformRole } from "../../shared/rbac";

/**
 * Extended user type with platform roles and status
 */
export interface PlatformUser {
  id: string;
  email: string;
  roles: PlatformRole[];
  status: string;
  subscription_status: string;
  display_name?: string;
  avatar_url?: string;
  phone?: string;
  last_active_at?: string;
}

/**
 * Middleware to require super admin role
 * Must be used AFTER authMiddleware
 */
export const superAdminMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  
  // Get user's roles from database
  const db = (c.env as { DB: D1Database }).DB;
  const dbUser = await db.prepare(`
    SELECT roles, status FROM users WHERE id = ?
  `).bind(user.id).first<{ roles: string | null; status: string | null }>();
  
  const roles = parseRoles(dbUser?.roles);
  
  if (!isSuperAdmin(roles)) {
    throw new HTTPException(403, { message: "Super Admin access required" });
  }
  
  // Check if user is active
  if (dbUser?.status && dbUser.status !== "active") {
    throw new HTTPException(403, { message: "Account is not active" });
  }
  
  // Update last active timestamp
  await db.prepare(`
    UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(user.id).run();
  
  // Store platform user info in context
  c.set("platformUser", {
    ...user,
    roles,
    status: dbUser?.status || "active",
  });
  
  await next();
};

/**
 * Middleware to require a specific role
 */
export function requireRole(role: PlatformRole): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user");
    
    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    
    const db = (c.env as { DB: D1Database }).DB;
    const dbUser = await db.prepare(`
      SELECT roles, status FROM users WHERE id = ?
    `).bind(user.id).first<{ roles: string | null; status: string | null }>();
    
    const roles = parseRoles(dbUser?.roles);
    
    if (!hasRole(roles, role)) {
      throw new HTTPException(403, { message: `${role} access required` });
    }
    
    if (dbUser?.status && dbUser.status !== "active") {
      throw new HTTPException(403, { message: "Account is not active" });
    }
    
    c.set("platformUser", {
      ...user,
      roles,
      status: dbUser?.status || "active",
    });
    
    await next();
  };
}

/**
 * Log an audit event (append-only, immutable)
 */
export async function logAuditEvent(
  db: D1Database,
  params: {
    actorUserId: string;
    actorRole: string;
    entityType: string;
    entityId?: string | number;
    actionType: string;
    summary: string;
    detailsJson?: Record<string, unknown>;
  }
) {
  const { actorUserId, actorRole, entityType, entityId, actionType, summary, detailsJson } = params;
  
  await db.prepare(`
    INSERT INTO event_log (
      event_type,
      user_id,
      actor_id,
      entity_type,
      entity_id,
      payload_json,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    actionType,
    null, // user_id is for the affected user, not always applicable
    actorUserId,
    entityType,
    entityId || null,
    detailsJson ? JSON.stringify({ ...detailsJson, actor_role: actorRole }) : JSON.stringify({ actor_role: actorRole }),
    summary
  ).run();
}

/**
 * Helper to get platform user from context
 */
export function getPlatformUser(c: Context): PlatformUser | null {
  return c.get("platformUser") || null;
}
