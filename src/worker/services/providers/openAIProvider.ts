export interface ProviderExecutionInput {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export interface ProviderExecutionOutput {
  content: string;
  model: string;
  latencyMs: number;
}
interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const REQUEST_TIMEOUT_MS = 12000;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export async function runOpenAIProvider(env: Env, input: ProviderExecutionInput): Promise<ProviderExecutionOutput> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: withTimeout(input.signal, REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const payload = await res.json() as OpenAIChatResponse;
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error("OpenAI empty content");
  return {
    content,
    model: input.model,
    latencyMs: Date.now() - started,
  };
}
