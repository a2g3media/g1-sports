type HeyGenGenerateResponse = {
  data?: { video_id?: string };
  video_id?: string;
};

type HeyGenStatusResponse = {
  data?: { status?: string; video_url?: string };
  status?: string;
  video_url?: string;
};

// Safety lock: only this HeyGen avatar is allowed for Coach G generation.
const ENFORCED_HEYGEN_AVATAR_ID = "7432856856a24eb18366c418b0cb5e26";

export interface CoachGVideoGenerationResult {
  video_id: string;
  video_url: string | null;
}

type HeyGenGeneratePayload = {
  dimension?: { width: number; height: number };
  video_inputs: Array<{
    character: Record<string, unknown>;
    voice: Record<string, unknown>;
    motion?: Record<string, unknown>;
    background?: Record<string, unknown>;
  }>;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnvValue(explicit?: string, processKey?: string): string | undefined {
  if (explicit && explicit.length > 0) return explicit;
  if (typeof process !== "undefined" && processKey && process?.env?.[processKey]) {
    return String(process.env[processKey]);
  }
  return undefined;
}

async function resolveVoiceId(apiKey: string, voiceName?: string, explicitVoiceId?: string): Promise<string | undefined> {
  if (explicitVoiceId) return explicitVoiceId;
  if (!voiceName) return undefined;
  try {
    const res = await fetch("https://api.heygen.com/v2/voices", {
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
    });
    if (!res.ok) return undefined;
    const body = await res.json() as {
      data?: { voices?: Array<{ voice_id?: string; id?: string; name?: string; voice_name?: string }> } | Array<{ voice_id?: string; id?: string; name?: string; voice_name?: string }>;
    };
    const voices = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.data?.voices)
        ? body.data.voices
        : [];
    const target = voiceName.trim().toLowerCase();
    const exact = voices.find((v) => String(v?.name || v?.voice_name || "").trim().toLowerCase() === target);
    if (exact) return String(exact.voice_id || exact.id || "").trim() || undefined;
    const partial = voices.find((v) => String(v?.name || v?.voice_name || "").toLowerCase().includes(target));
    return partial ? (String(partial.voice_id || partial.id || "").trim() || undefined) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchHeyGenVideoUrl(
  apiKey: string,
  videoId: string,
  maxPolls = 6,
  intervalMs = 4000
): Promise<string | null> {
  for (let i = 0; i < maxPolls; i += 1) {
    const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
    });
    if (!statusRes.ok) return null;
    const body = await statusRes.json() as HeyGenStatusResponse;
    const status = String(body?.data?.status || body?.status || "").toLowerCase();
    const url = String(body?.data?.video_url || body?.video_url || "");
    if (status === "completed" && url) return url;
    if (status === "failed" || status === "error") return null;
    if (i < maxPolls - 1) await sleep(intervalMs);
  }
  return null;
}

function buildCoachGMotionPrompt(scriptText: string): string {
  const text = (scriptText || "").toLowerCase();
  const cues: string[] = [];
  cues.push("Torso + rhythmic stance shift + energized");
  if (text.includes("line") || text.includes("market")) {
    cues.push("Hands + point to side + analytical");
  }
  if (text.includes("watch") || text.includes("key")) {
    cues.push("Head + nod + focused");
  }
  if (text.includes("risk") || text.includes("discipline")) {
    cues.push("Arms + controlled open/close gesture + serious");
  }
  if (text.includes("upset") || text.includes("volatile")) {
    cues.push("Shoulders + brief emphasis lean + intense");
  }
  if (text.includes("nba") || text.includes("ncaab") || text.includes("basketball")) {
    cues.push("Arms + quick crossover-style presentation gesture + excited");
  }
  if (text.includes("nfl") || text.includes("football")) {
    cues.push("Upper body + confident forward drive + fired-up");
  }
  if (text.includes("mlb") || text.includes("baseball")) {
    cues.push("Arms + compact swing mimic + upbeat");
  }
  if (text.includes("nhl") || text.includes("hockey")) {
    cues.push("Shoulders + strong check-style emphasis + intense");
  }
  if (cues.length === 0) {
    cues.push("Hands + light presenting gestures + confident");
    cues.push("Head + periodic nod + engaged");
  }
  return cues.join("; ");
}

export async function generateCoachGVideo(
  scriptText: string,
  env?: Pick<Env, "HEYGEN_API_KEY" | "HEYGEN_AVATAR_ID" | "HEYGEN_VOICE_NAME" | "HEYGEN_VOICE_ID">
): Promise<CoachGVideoGenerationResult> {
  const apiKey = readEnvValue(env?.HEYGEN_API_KEY, "HEYGEN_API_KEY");
  const avatarId = readEnvValue(env?.HEYGEN_AVATAR_ID, "HEYGEN_AVATAR_ID");
  const voiceName = readEnvValue(env?.HEYGEN_VOICE_NAME, "HEYGEN_VOICE_NAME");
  const fallbackVoiceId = readEnvValue(env?.HEYGEN_VOICE_ID, "HEYGEN_VOICE_ID");

  if (!apiKey) throw new Error("HEYGEN_API_KEY is required");
  if (!avatarId) throw new Error("HEYGEN_AVATAR_ID is required");
  if (avatarId !== ENFORCED_HEYGEN_AVATAR_ID) {
    throw new Error(`HEYGEN_AVATAR_ID must be ${ENFORCED_HEYGEN_AVATAR_ID}`);
  }
  if (!voiceName && !fallbackVoiceId) {
    throw new Error("HEYGEN_VOICE_NAME (or HEYGEN_VOICE_ID fallback) is required");
  }
  const resolvedVoiceId = await resolveVoiceId(apiKey, voiceName, fallbackVoiceId);
  if (!resolvedVoiceId) {
    throw new Error("Could not resolve valid HEYGEN_VOICE_ID from configured voice settings");
  }

  const voicePayload: Record<string, string | number> = {
    type: "text",
    voice_id: resolvedVoiceId,
    input_text: scriptText,
    // Slightly slower cadence tends to feel more conversational and less clipped.
    speed: 0.97,
  };
  const motionPrompt = buildCoachGMotionPrompt(scriptText);

  // Try an enhanced framing payload first for more upper-body presence.
  const payloadVariants: HeyGenGeneratePayload[] = [
    {
      dimension: { width: 1080, height: 1920 },
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "full",
            scale: 0.62,
            offset: { x: 0, y: 0.2 },
            motion_prompt: motionPrompt,
          },
          motion: {
            type: "motion_prompt",
            prompt: motionPrompt,
          },
          voice: voicePayload,
          background: {
            type: "color",
            value: "#0b1220",
          },
        },
      ],
    },
    {
      dimension: { width: 1080, height: 1920 },
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "full",
            scale: 0.72,
            offset: { x: 0, y: 0.14 },
            motion_prompt: motionPrompt,
          },
          motion: {
            type: "motion_prompt",
            prompt: motionPrompt,
          },
          voice: voicePayload,
        },
      ],
    },
    {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
          },
          voice: voicePayload,
        },
      ],
    },
  ];

  let body: HeyGenGenerateResponse | null = null;
  let lastErrorDetail = "";
  for (const payload of payloadVariants) {
    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      body = await res.json() as HeyGenGenerateResponse;
      break;
    }
    const errorText = await res.text().catch(() => "");
    lastErrorDetail = `HeyGen HTTP ${res.status}${errorText ? `: ${errorText.slice(0, 400)}` : ""}`;
    // If request is accepted but this payload shape is unsupported, continue to safer variant.
    if (res.status === 400 || res.status === 422) continue;
    throw new Error(lastErrorDetail);
  }
  if (!body) {
    throw new Error(lastErrorDetail || "HeyGen rejected all payload variants");
  }
  const videoId = String(body?.data?.video_id || body?.video_id || "");
  if (!videoId) throw new Error("Missing video_id from HeyGen generate response");

  const videoUrl = await fetchHeyGenVideoUrl(apiKey, videoId);
  return {
    video_id: videoId,
    video_url: videoUrl,
  };
}
