import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { requestContext } from "./lib/request-context.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

type WaitUntil = (p: Promise<unknown>) => void;
type WaitUntilHolder = { waitUntil?: WaitUntil };

/**
 * On Cloudflare, nitro calls this entry with only the request and puts the worker's waitUntil
 * on the request itself (request.waitUntil / request.runtime.cloudflare.context). Without it,
 * work "after the response" ran before it, so the WhatsApp gateway (≈5s limit) cut every AI reply.
 */
function findWaitUntil(request: Request, ctx: unknown): WaitUntil | undefined {
  const req = request as Request & WaitUntilHolder & { runtime?: { cloudflare?: { context?: WaitUntilHolder } } };
  const holders: (WaitUntilHolder | undefined)[] = [ctx as WaitUntilHolder | undefined, req.runtime?.cloudflare?.context];
  for (const h of holders) if (typeof h?.waitUntil === "function") return h.waitUntil.bind(h);
  if (typeof req.waitUntil === "function") return req.waitUntil;
  return undefined;
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const waitUntil = findWaitUntil(request, ctx);
      const response = await requestContext.run({ waitUntil }, () => handler.fetch(request, env, ctx));
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
