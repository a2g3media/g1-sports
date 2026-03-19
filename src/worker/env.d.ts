// Extended environment bindings for GZ Sports
// Adds secrets not auto-detected by Wrangler types

declare global {
  interface Env {
    [key: string]: unknown;
    DB?: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_COACHG_MODEL?: string;
    MOCHA_USERS_SERVICE_API_URL?: string;
    MOCHA_USERS_SERVICE_API_KEY?: string;
    FIRECRAWL_API_KEY?: string;
    SPORTSRADAR_ODDS_KEY?: string;
    SPORTSRADAR_API_KEY?: string;
    SPORTSRADAR_PLAYER_PROPS_KEY?: string;
    SPORTSRADAR_PROPS_KEY?: string;
    TICKET_HANDLE_FEED_URL?: string;
    TICKET_HANDLE_FEED_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_COACHG_MODEL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_COACHG_MODEL?: string;
    HEYGEN_API_KEY?: string;
    HEYGEN_AVATAR_ID?: string;
    HEYGEN_VOICE_ID?: string;
    HEYGEN_VOICE_NAME?: string;
    INSTAGRAM_ACCESS_TOKEN?: string;
    FACEBOOK_PAGE_ACCESS_TOKEN?: string;
    TIKTOK_ACCESS_TOKEN?: string;
    APP_BASE_URL?: string;
    COACHG_V3_ENABLED?: string;
    SOCIAL_CAMPAIGN_WEBHOOK_URL?: string;
    SOCIAL_CAMPAIGN_API_KEY?: string;
    PARTNER_ALERT_WEBHOOK_URL?: string;
    PARTNER_ALERT_WEBHOOK_KEY?: string;
  }
}

export {};
