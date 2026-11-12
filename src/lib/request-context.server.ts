// Server-only: exposes the worker's waitUntil to route handlers.
import { AsyncLocalStorage } from "node:async_hooks";

type Ctx = { waitUntil?: (p: Promise<unknown>) => void };
export const requestContext = new AsyncLocalStorage<Ctx>();

/** Runs work after the response is sent when the runtime allows it; otherwise awaits it. */
export async function runInBackground(work: () => Promise<unknown>) {
  const ctx = requestContext.getStore();
  const p = work().catch((e) => console.error("background work failed", e));
  if (ctx?.waitUntil) {
    ctx.waitUntil(p);
    return;
  }
  await p;
}
