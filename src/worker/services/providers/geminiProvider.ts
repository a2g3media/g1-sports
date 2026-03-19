import type { ProviderExecutionInput, ProviderExecutionOutput } from "./openAIProvider";
interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
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

export async function runGeminiProvider(env: Env, input: ProviderExecutionInput): Promise<ProviderExecutionOutput> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: withTimeout(input.signal, REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const payload = await res.json() as GeminiGenerateResponse;
  const content = String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!content) throw new Error("Gemini empty content");
  return {
    content,
    model: input.model,
    latencyMs: Date.now() - started,
  };
}
