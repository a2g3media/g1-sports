import type { ProviderExecutionInput, ProviderExecutionOutput } from "./openAIProvider";
interface ClaudeMessageTextBlock {
  type?: string;
  text?: string;
}
interface ClaudeMessageResponse {
  content?: ClaudeMessageTextBlock[];
}

const REQUEST_TIMEOUT_MS = 12000;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export async function runClaudeProvider(env: Env, input: ProviderExecutionInput): Promise<ProviderExecutionOutput> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: withTimeout(input.signal, REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      max_tokens: 500,
      temperature: 0.2,
      system: `${input.systemPrompt} Return strict JSON only.`,
      messages: [{ role: "user", content: input.userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const payload = await res.json() as ClaudeMessageResponse;
  const content = Array.isArray(payload?.content)
    ? String(payload.content.find((item) => item?.type === "text")?.text || "").trim()
    : "";
  if (!content) throw new Error("Claude empty content");
  return {
    content,
    model: input.model,
    latencyMs: Date.now() - started,
  };
}
