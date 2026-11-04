import "server-only";
import { buildDispatchRequest, localScrapeCommand, type DispatchInputs } from "./github-request";

export type DispatchResult = { dispatched: true } | { dispatched: false; command: string };

/** Starts scrape.yml for one pair. Without GH_DISPATCH_TOKEN/GH_REPO it returns the local command instead. */
export async function dispatchScrape(inputs: DispatchInputs): Promise<DispatchResult> {
  const req = buildDispatchRequest(process.env, inputs);
  if (!req) return { dispatched: false, command: localScrapeCommand(inputs) };
  const res = await fetch(req.url, { ...req.init, cache: "no-store" });
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`GitHub dispatch failed (HTTP ${res.status})`);
  }
  return { dispatched: true };
}
