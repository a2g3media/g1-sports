/**
 * Weekly Recap Email API Routes
 * 
 * Handles preview, sending, and management of weekly recap emails.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  buildWeeklyRecap,
  getWeeklyRecapRecipients,
  isUserOptedIntoWeeklyRecap,
  setWeeklyRecapOptIn,
} from "../services/weeklyRecapService";
import { generateWeeklyRecapEmail } from "../email-templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

interface EmailParams {
  to: string;
  subject: string;
  html_body?: string;
  text_body?: string;
  reply_to?: string;
  customer_id?: string;
}

interface EmailResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

interface EmailService {
  send(params: EmailParams): Promise<EmailResult>;
}

type Env = {
  DB: D1Database;
  EMAILS: EmailService;
};

type Variables = {
  userId: string;
  dataScope: "DEMO" | "PROD";
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply auth middleware to all routes
app.use("*", authMiddleware);

/**
 * GET /api/weekly-recap/preview
 * Preview the weekly recap email for the current user
 */
app.get("/preview", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  try {
    // Get app base URL from request
    const url = new URL(c.req.url);
    const appBaseUrl = `${url.protocol}//${url.host}`;
    
    const recapData = await buildWeeklyRecap(db, userId, appBaseUrl);
    
    if (!recapData) {
      return c.json({ 
        error: "No recap data available",
        reason: "You may not be in any active pools with recent activity."
      }, 404);
    }
    
    const email = generateWeeklyRecapEmail(recapData);
    
    return c.json({
      preview: true,
      data: recapData,
      email: {
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    });
  } catch (error) {
    console.error("Error generating preview:", error);
    return c.json({ error: "Failed to generate preview" }, 500);
  }
});

/**
 * POST /api/weekly-recap/send-test
 * Send a test weekly recap email to the current user
 */
app.post("/send-test", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  try {
    const url = new URL(c.req.url);
    const appBaseUrl = `${url.protocol}//${url.host}`;
    
    const recapData = await buildWeeklyRecap(db, userId, appBaseUrl);
    
    if (!recapData) {
      return c.json({ 
        error: "No recap data available",
        reason: "You may not be in any active pools with recent activity."
      }, 400);
    }
    
    const email = generateWeeklyRecapEmail(recapData);
    
    const result = await c.env.EMAILS.send({
      to: recapData.userEmail,
      subject: `[TEST] ${email.subject}`,
      html_body: email.html,
      text_body: email.text,
      customer_id: userId,
    });
    
    if (!result.success) {
      return c.json({ error: result.error || "Failed to send email" }, 500);
    }
    
    return c.json({
      success: true,
      message_id: result.message_id,
      sent_to: recapData.userEmail,
    });
  } catch (error) {
    console.error("Error sending test email:", error);
    return c.json({ error: "Failed to send test email" }, 500);
  }
});

/**
 * GET /api/weekly-recap/status
 * Get the user's weekly recap subscription status
 */
app.get("/status", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  try {
    const isOptedIn = await isUserOptedIntoWeeklyRecap(db, userId);
    
    return c.json({
      opted_in: isOptedIn,
    });
  } catch (error) {
    console.error("Error checking status:", error);
    return c.json({ error: "Failed to check status" }, 500);
  }
});

/**
 * POST /api/weekly-recap/subscribe
 * Subscribe to weekly recap emails
 */
app.post("/subscribe", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  try {
    await setWeeklyRecapOptIn(db, userId, true);
    
    return c.json({
      success: true,
      opted_in: true,
    });
  } catch (error) {
    console.error("Error subscribing:", error);
    return c.json({ error: "Failed to subscribe" }, 500);
  }
});

/**
 * POST /api/weekly-recap/unsubscribe
 * Unsubscribe from weekly recap emails
 */
app.post("/unsubscribe", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  try {
    await setWeeklyRecapOptIn(db, userId, false);
    
    return c.json({
      success: true,
      opted_in: false,
    });
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return c.json({ error: "Failed to unsubscribe" }, 500);
  }
});

/**
 * POST /api/weekly-recap/trigger-all
 * Admin endpoint to trigger weekly recap emails for all opted-in users
 * Should be called by a scheduled job (cron)
 */
app.post("/trigger-all", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  
  // Check if user is admin
  const user = await db.prepare(`
    SELECT roles FROM users WHERE id = ?
  `).bind(userId).first();
  
  const roles = JSON.parse(user?.roles || '["player"]');
  if (!roles.includes("super_admin") && !roles.includes("admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }
  
  try {
    const url = new URL(c.req.url);
    const appBaseUrl = `${url.protocol}//${url.host}`;
    
    const recipients = await getWeeklyRecapRecipients(db);
    
    const results = {
      total: recipients.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };
    
    for (const recipient of recipients) {
      try {
        const recapData = await buildWeeklyRecap(db, recipient.userId, appBaseUrl);
        
        if (!recapData || recapData.totalPicks === 0) {
          results.skipped++;
          continue;
        }
        
        const email = generateWeeklyRecapEmail(recapData);
        
        const sendResult = await c.env.EMAILS.send({
          to: recipient.email,
          subject: email.subject,
          html_body: email.html,
          text_body: email.text,
          customer_id: recipient.userId,
        });
        
        if (sendResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({ email: recipient.email, error: sendResult.error || "Unknown error" });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ email: recipient.email, error: String(err) });
      }
    }
    
    // Log the send
    await db.prepare(`
      INSERT INTO event_log (event_type, payload_json, created_at, updated_at)
      VALUES ('weekly_recap_batch_send', ?, datetime('now'), datetime('now'))
    `).bind(JSON.stringify(results)).run();
    
    return c.json(results);
  } catch (error) {
    console.error("Error triggering batch send:", error);
    return c.json({ error: "Failed to trigger batch send" }, 500);
  }
});

export const weeklyRecapRouter = app;
