type ApiProxyEnv = {
  API_PROXY_ORIGIN?: string;
  WORKER_API_ORIGIN?: string;
};

const DEFAULT_API_ORIGIN = "https://019ce56b-b0ff-7056-a2d5-613f9cde7650.george-119.workers.dev";

function getApiOrigin(env: ApiProxyEnv): string {
  const candidate = String(env.API_PROXY_ORIGIN || env.WORKER_API_ORIGIN || DEFAULT_API_ORIGIN).trim();
  return candidate.replace(/\/+$/, "");
}

export const onRequest: PagesFunction<ApiProxyEnv> = async (context) => {
  const incomingUrl = new URL(context.request.url);
  const apiOrigin = getApiOrigin(context.env);
  const upstreamUrl = new URL(`${apiOrigin}${incomingUrl.pathname}${incomingUrl.search}`);

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  const method = context.request.method.toUpperCase();
  const requestInit: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    requestInit.body = context.request.body;
  }

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      ...requestInit,
      signal: controller.signal,
    });
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("x-api-proxy", "pages-functions");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "api_upstream_unavailable",
        message: "API temporarily unavailable. Please retry shortly.",
        details: error instanceof Error ? error.message : "Unknown upstream error",
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-api-proxy": "pages-functions",
        },
      }
    );
  } finally {
    clearTimeout(timeout);
  }
};
