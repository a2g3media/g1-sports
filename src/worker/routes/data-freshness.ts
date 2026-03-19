// Data Freshness Monitoring API Routes
import { Hono } from "hono";
import {
  checkAllSourcesFreshness,
  getActiveAlerts,
  getSourceHistory,
  resolveAlert,
  MONITORED_SOURCES,
} from "../services/data-freshness-service";
import {
  getCacheStats,
  clearCache,
  CACHE_CONFIG,
} from "../services/scout-cache";

type Bindings = {
  DB: D1Database;
};

const freshnessRoutes = new Hono<{ Bindings: Bindings }>();

// Get current freshness status for all sources
freshnessRoutes.get("/status", async (c) => {
  try {
    const { results, summary, generatedAlerts } = await checkAllSourcesFreshness(c.env.DB);
    
    return c.json({
      success: true,
      data: {
        sources: results,
        summary,
        newAlerts: generatedAlerts,
        monitoredCount: MONITORED_SOURCES.length,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Freshness check error:", error);
    return c.json({ success: false, error: "Failed to check data freshness" }, 500);
  }
});

// Get summary only (lightweight check)
freshnessRoutes.get("/summary", async (c) => {
  try {
    const { summary } = await checkAllSourcesFreshness(c.env.DB);
    
    return c.json({
      success: true,
      data: {
        ...summary,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Freshness summary error:", error);
    return c.json({ success: false, error: "Failed to get freshness summary" }, 500);
  }
});

// Get active alerts
freshnessRoutes.get("/alerts", async (c) => {
  try {
    const alerts = await getActiveAlerts(c.env.DB);
    
    return c.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        hasCritical: alerts.some(a => a.severity === "critical"),
      },
    });
  } catch (error) {
    console.error("Get alerts error:", error);
    return c.json({ success: false, error: "Failed to get alerts" }, 500);
  }
});

// Get history for a specific source
freshnessRoutes.get("/source/:key", async (c) => {
  try {
    const sourceKey = c.req.param("key");
    const history = await getSourceHistory(c.env.DB, sourceKey);
    
    if (!history.current) {
      return c.json({ success: false, error: "Source not found" }, 404);
    }
    
    return c.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Get source history error:", error);
    return c.json({ success: false, error: "Failed to get source history" }, 500);
  }
});

// Resolve an alert manually
freshnessRoutes.post("/alerts/:id/resolve", async (c) => {
  try {
    const alertId = parseInt(c.req.param("id"));
    const body = await c.req.json<{ resolvedBy?: string }>();
    
    await resolveAlert(c.env.DB, alertId, body.resolvedBy || "manual");
    
    return c.json({
      success: true,
      message: "Alert resolved",
    });
  } catch (error) {
    console.error("Resolve alert error:", error);
    return c.json({ success: false, error: "Failed to resolve alert" }, 500);
  }
});

// Get list of monitored sources (config)
freshnessRoutes.get("/sources", async (c) => {
  return c.json({
    success: true,
    data: MONITORED_SOURCES.map(s => ({
      key: s.key,
      name: s.name,
      category: s.category,
      isCritical: s.isCritical || false,
      staleThresholdMinutes: s.staleThresholdMinutes,
      warningThresholdMinutes: s.warningThresholdMinutes,
    })),
  });
});

// ==================== CACHE MANAGEMENT ====================

// Get cache statistics
freshnessRoutes.get("/cache/stats", async (c) => {
  try {
    const stats = await getCacheStats(c.env.DB);
    
    return c.json({
      success: true,
      data: {
        ...stats,
        config: CACHE_CONFIG,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Cache stats error:", error);
    return c.json({ success: false, error: "Failed to get cache stats" }, 500);
  }
});

// Get cache configuration
freshnessRoutes.get("/cache/config", async (c) => {
  return c.json({
    success: true,
    data: Object.entries(CACHE_CONFIG).map(([tool, config]) => ({
      toolName: tool,
      ttlMinutes: config.ttlMinutes,
      maxEntries: config.maxEntries,
    })),
  });
});

// Clear all cache or specific tool cache
freshnessRoutes.post("/cache/clear", async (c) => {
  try {
    const body = await c.req.json<{ toolName?: string }>().catch(() => ({ toolName: undefined }));
    const toolName = body.toolName;
    const deleted = await clearCache(c.env.DB, toolName);
    
    return c.json({
      success: true,
      message: toolName 
        ? `Cleared ${deleted} cache entries for ${toolName}` 
        : `Cleared ${deleted} total cache entries`,
      deletedCount: deleted,
    });
  } catch (error) {
    console.error("Cache clear error:", error);
    return c.json({ success: false, error: "Failed to clear cache" }, 500);
  }
});

export { freshnessRoutes };
