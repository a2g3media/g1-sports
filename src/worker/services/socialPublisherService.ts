import {
  buildFacebookCaption,
  buildInstagramCaption,
  buildTikTokCaption,
} from "./captionGeneratorService";
import {
  logCoachGSocialPost,
  type CoachGFeaturedItemRecord,
  type CoachGSocialPlatform,
  type CoachGSocialStatus,
  updateCoachGFeaturedItemStates,
} from "./coachgFeaturedContentRepository";

export interface SocialPublishResult {
  platform: CoachGSocialPlatform;
  status: CoachGSocialStatus;
  success: boolean;
  postId: string | null;
  response: string | null;
  error: string | null;
  retryPending: boolean;
}

function makePostJobId(itemId: string, platform: CoachGSocialPlatform): string {
  return `${itemId}:${platform}`;
}

async function parseResponseBody(res: Response): Promise<string> {
  return (await res.text()).slice(0, 2000);
}

function statusFromResult(ok: boolean, retryPending: boolean): CoachGSocialStatus {
  if (ok) return "published";
  return retryPending ? "retry_pending" : "failed";
}

export async function publishToInstagram(params: {
  item: CoachGFeaturedItemRecord;
  env: Env;
}): Promise<SocialPublishResult> {
  const { item, env } = params;
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    return {
      platform: "instagram",
      success: false,
      status: "failed",
      postId: null,
      response: null,
      error: "INSTAGRAM_ACCESS_TOKEN missing",
      retryPending: false,
    };
  }
  if (!item.videoUrl) {
    return {
      platform: "instagram",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: "Video URL not ready",
      retryPending: true,
    };
  }
  const caption = buildInstagramCaption({
    headline: item.headline,
    shortSummary: item.shortSummary,
    sport: item.sport,
    gameId: item.gameId,
    appBaseUrl: env.APP_BASE_URL,
  });

  try {
    const createRes = await fetch("https://graph.facebook.com/v20.0/me/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: item.videoUrl,
        caption,
        access_token: env.INSTAGRAM_ACCESS_TOKEN,
      }),
    });
    const createBody = await parseResponseBody(createRes);
    if (!createRes.ok) {
      return {
        platform: "instagram",
        success: false,
        status: "retry_pending",
        postId: null,
        response: createBody,
        error: `Instagram create media failed (${createRes.status})`,
        retryPending: true,
      };
    }

    const parsed = JSON.parse(createBody || "{}") as { id?: string };
    const creationId = parsed.id;
    if (!creationId) {
      return {
        platform: "instagram",
        success: false,
        status: "retry_pending",
        postId: null,
        response: createBody,
        error: "Instagram creation id missing",
        retryPending: true,
      };
    }

    const publishRes = await fetch("https://graph.facebook.com/v20.0/me/media_publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: env.INSTAGRAM_ACCESS_TOKEN,
      }),
    });
    const publishBody = await parseResponseBody(publishRes);
    if (!publishRes.ok) {
      return {
        platform: "instagram",
        success: false,
        status: "retry_pending",
        postId: null,
        response: publishBody,
        error: `Instagram publish failed (${publishRes.status})`,
        retryPending: true,
      };
    }
    const post = JSON.parse(publishBody || "{}") as { id?: string };
    return {
      platform: "instagram",
      success: true,
      status: "published",
      postId: post.id || creationId,
      response: publishBody,
      error: null,
      retryPending: false,
    };
  } catch (error) {
    return {
      platform: "instagram",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: error instanceof Error ? error.message : "Instagram network failure",
      retryPending: true,
    };
  }
}

export async function publishToFacebook(params: {
  item: CoachGFeaturedItemRecord;
  env: Env;
}): Promise<SocialPublishResult> {
  const { item, env } = params;
  if (!env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    return {
      platform: "facebook",
      success: false,
      status: "failed",
      postId: null,
      response: null,
      error: "FACEBOOK_PAGE_ACCESS_TOKEN missing",
      retryPending: false,
    };
  }
  if (!item.videoUrl) {
    return {
      platform: "facebook",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: "Video URL not ready",
      retryPending: true,
    };
  }
  const description = buildFacebookCaption({
    headline: item.headline,
    shortSummary: item.shortSummary,
    sport: item.sport,
    gameId: item.gameId,
    appBaseUrl: env.APP_BASE_URL,
  });
  try {
    const res = await fetch("https://graph.facebook.com/v20.0/me/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: item.videoUrl,
        description,
        access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      }),
    });
    const body = await parseResponseBody(res);
    if (!res.ok) {
      return {
        platform: "facebook",
        success: false,
        status: "retry_pending",
        postId: null,
        response: body,
        error: `Facebook publish failed (${res.status})`,
        retryPending: true,
      };
    }
    const parsed = JSON.parse(body || "{}") as { id?: string };
    return {
      platform: "facebook",
      success: true,
      status: "published",
      postId: parsed.id || null,
      response: body,
      error: null,
      retryPending: false,
    };
  } catch (error) {
    return {
      platform: "facebook",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: error instanceof Error ? error.message : "Facebook network failure",
      retryPending: true,
    };
  }
}

export async function publishToTikTok(params: {
  item: CoachGFeaturedItemRecord;
  env: Env;
}): Promise<SocialPublishResult> {
  const { item, env } = params;
  if (!env.TIKTOK_ACCESS_TOKEN) {
    return {
      platform: "tiktok",
      success: false,
      status: "failed",
      postId: null,
      response: null,
      error: "TIKTOK_ACCESS_TOKEN missing",
      retryPending: false,
    };
  }
  if (!item.videoUrl) {
    return {
      platform: "tiktok",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: "Video URL not ready",
      retryPending: true,
    };
  }
  const caption = buildTikTokCaption({
    headline: item.headline,
    shortSummary: item.shortSummary,
    sport: item.sport,
    gameId: item.gameId,
    appBaseUrl: env.APP_BASE_URL,
  });
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        post_info: { title: caption, privacy_level: "PUBLIC_TO_EVERYONE" },
        source_info: { source: "PULL_FROM_URL", video_url: item.videoUrl },
      }),
    });
    const body = await parseResponseBody(res);
    if (!res.ok) {
      return {
        platform: "tiktok",
        success: false,
        status: "retry_pending",
        postId: null,
        response: body,
        error: `TikTok publish init failed (${res.status})`,
        retryPending: true,
      };
    }
    const parsed = JSON.parse(body || "{}") as { data?: { publish_id?: string } };
    return {
      platform: "tiktok",
      success: true,
      status: "published",
      postId: parsed.data?.publish_id || null,
      response: body,
      error: null,
      retryPending: false,
    };
  } catch (error) {
    return {
      platform: "tiktok",
      success: false,
      status: "retry_pending",
      postId: null,
      response: null,
      error: error instanceof Error ? error.message : "TikTok network failure",
      retryPending: true,
    };
  }
}

export async function publishCoachGItemToSocial(params: {
  db: D1Database;
  env: Env;
  item: CoachGFeaturedItemRecord;
  platformEnabled: { instagram: boolean; facebook: boolean; tiktok: boolean };
}): Promise<SocialPublishResult[]> {
  const { db, env, item, platformEnabled } = params;
  const tasks: Array<Promise<SocialPublishResult>> = [];
  if (platformEnabled.instagram) tasks.push(publishToInstagram({ item, env }));
  if (platformEnabled.facebook) tasks.push(publishToFacebook({ item, env }));
  if (platformEnabled.tiktok) tasks.push(publishToTikTok({ item, env }));
  const results = await Promise.all(tasks);

  const stateUpdates: Partial<Record<CoachGSocialPlatform, CoachGSocialStatus>> = {};
  for (const result of results) {
    stateUpdates[result.platform] = result.status;
    await logCoachGSocialPost(db, {
      postJobId: makePostJobId(item.itemId, result.platform),
      itemId: item.itemId,
      platform: result.platform,
      status: result.status,
      captionText:
        result.platform === "instagram"
          ? buildInstagramCaption({
            headline: item.headline,
            shortSummary: item.shortSummary,
            sport: item.sport,
            gameId: item.gameId,
            appBaseUrl: env.APP_BASE_URL,
          })
          : result.platform === "facebook"
            ? buildFacebookCaption({
              headline: item.headline,
              shortSummary: item.shortSummary,
              sport: item.sport,
              gameId: item.gameId,
              appBaseUrl: env.APP_BASE_URL,
            })
            : buildTikTokCaption({
              headline: item.headline,
              shortSummary: item.shortSummary,
              sport: item.sport,
              gameId: item.gameId,
              appBaseUrl: env.APP_BASE_URL,
            }),
      postId: result.postId,
      responseJson: result.response,
      errorMessage: result.error,
      retryCount: result.retryPending ? 1 : 0,
      nextRetryAt: result.retryPending ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
    });
  }

  await updateCoachGFeaturedItemStates(db, item.itemId, {
    socialStatusInstagram: stateUpdates.instagram,
    socialStatusFacebook: stateUpdates.facebook,
    socialStatusTiktok: stateUpdates.tiktok,
  });

  return results;
}

