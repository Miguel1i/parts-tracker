import "server-only";
import { buildDispatchRequest, localScrapeCommand, type DispatchInputs } from "./github-request";

export type DispatchResult = { dispatched: true } | { dispatched: false; command: string };

/** Starts scrape.yml for one pair. Without GH_DISPATCH_TOKEN/GH_REPO it returns the local command instead. */
export async function dispatchScrape(inputs: DispatchInputs): Promise<DispatchResult> {
  const req = buildDispatchRequest(process.env, inputs);
  if (!req) {
    // On a deployment nobody can run the local command: fail loudly instead of leaving the
    // run "queued" forever (callers mark it failed and show `dispatchFailed`).
    if (process.env.VERCEL) throw new Error("GH_DISPATCH_TOKEN is not set on this deployment");
    return { dispatched: false, command: localScrapeCommand(inputs) };
  }
  const res = await fetch(req.url, { ...req.init, cache: "no-store" });
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`GitHub dispatch failed (HTTP ${res.status})`);
  }
  return { dispatched: true };
}
