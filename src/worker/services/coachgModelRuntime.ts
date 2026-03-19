import type { CoachGTask, ModelRouteDecision, ProviderName } from "../types/coachg";
import {
  buildCoachGSystemPrompt,
  buildCoachGUserPrompt,
  normalizeCoachGAIResult,
  type CoachGAIResult,
  type CoachGPromptInput,
} from "./coachgPromptPolicy";
import { runOpenAIProvider } from "./providers/openAIProvider";
import { runClaudeProvider } from "./providers/claudeProvider";
import { runGeminiProvider } from "./providers/geminiProvider";

interface ProviderResult {
  content: string;
  provider: ProviderName;
  model: string;
  latency_ms: number;
  fallback_used: boolean;
}

export interface CoachGModelExecution {
  ai: CoachGAIResult;
  telemetry: {
    provider: string;
    model: string;
    latency_ms: number;
    fallback_used: boolean;
    reason: string;
  };
}

async function callOpenAI(
  env: Env,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const out = await runOpenAIProvider(env, { model, systemPrompt, userPrompt, signal });
  return {
    content: out.content,
    provider: "openai",
    model: out.model,
    latency_ms: out.latencyMs,
    fallback_used: false,
  };
}

async function callClaude(
  env: Env,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const out = await runClaudeProvider(env, { model, systemPrompt, userPrompt, signal });
  return {
    content: out.content,
    provider: "claude",
    model: out.model,
    latency_ms: out.latencyMs,
    fallback_used: false,
  };
}

async function callGemini(
  env: Env,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const out = await runGeminiProvider(env, { model, systemPrompt, userPrompt, signal });
  return {
    content: out.content,
    provider: "gemini",
    model: out.model,
    latency_ms: out.latencyMs,
    fallback_used: false,
  };
}

function providerDefaultModel(provider: ProviderName, env: Env): string {
  if (provider === "openai") return env.OPENAI_COACHG_MODEL || "gpt-4o-mini";
  if (provider === "claude") return env.ANTHROPIC_COACHG_MODEL || "claude-sonnet-4-5";
  return env.GEMINI_COACHG_MODEL || "gemini-1.5-pro";
}

function parseModelJSON(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function runCoachGModelTask(params: {
  env: Env;
  task: CoachGTask;
  route: ModelRouteDecision;
  prompt: CoachGPromptInput;
  fallbackSummary: string;
  signal?: AbortSignal;
}): Promise<CoachGModelExecution> {
  const { env, task, route, prompt, fallbackSummary, signal } = params;
  const systemPrompt = buildCoachGSystemPrompt(task);
  const userPrompt = buildCoachGUserPrompt(prompt);

  const primaryProvider = route.provider;
  const fallbackOrder: ProviderName[] = [primaryProvider]
    .concat(["openai", "claude", "gemini"].filter((p) => p !== primaryProvider) as ProviderName[]);

  let lastErr: string | null = null;
  for (let i = 0; i < fallbackOrder.length; i += 1) {
    const provider = fallbackOrder[i];
    const model = i === 0 ? route.model : providerDefaultModel(provider, env);
    try {
      const raw = provider === "openai"
        ? await callOpenAI(env, model, systemPrompt, userPrompt, signal)
        : provider === "claude"
          ? await callClaude(env, model, systemPrompt, userPrompt, signal)
          : await callGemini(env, model, systemPrompt, userPrompt, signal);

      const parsed = parseModelJSON(raw.content);
      const ai = normalizeCoachGAIResult(parsed, fallbackSummary);
      return {
        ai,
        telemetry: {
          provider: raw.provider,
          model: raw.model,
          latency_ms: raw.latency_ms,
          fallback_used: i > 0,
          reason: i > 0 ? `Primary provider ${primaryProvider} unavailable` : route.reason,
        },
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ai: normalizeCoachGAIResult(null, fallbackSummary),
    telemetry: {
      provider: primaryProvider,
      model: route.model,
      latency_ms: 0,
      fallback_used: true,
      reason: `All providers unavailable: ${lastErr || "unknown"}`,
    },
  };
}
