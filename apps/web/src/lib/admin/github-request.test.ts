import { describe, expect, it } from "vitest";
import { buildDispatchRequest, localScrapeCommand } from "./github-request";

const inputs = { productId: "p1", merchantId: "m1", runId: "r1" };

describe("buildDispatchRequest", () => {
  it("is null without token or repo", () => {
    expect(buildDispatchRequest({}, inputs)).toBeNull();
    expect(buildDispatchRequest({ GH_REPO: "a/b" }, inputs)).toBeNull();
    expect(buildDispatchRequest({ GH_DISPATCH_TOKEN: "t" }, inputs)).toBeNull();
  });

  it("builds the workflow dispatch request", () => {
    const r = buildDispatchRequest(
      { GH_DISPATCH_TOKEN: "tok", GH_REPO: "me/parts.tracker" },
      inputs,
    )!;
    expect(r.url).toBe(
      "https://api.github.com/repos/me/parts.tracker/actions/workflows/scrape.yml/dispatches",
    );
    expect(r.init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(r.init.body)).toEqual({ ref: "main", inputs });
    const r2 = buildDispatchRequest(
      { GH_DISPATCH_TOKEN: "tok", GH_REPO: "me/x", GH_DISPATCH_REF: "dev" },
      inputs,
    )!;
    expect(JSON.parse(r2.init.body).ref).toBe("dev");
  });

  it("rejects a malformed repo", () => {
    expect(() =>
      buildDispatchRequest({ GH_DISPATCH_TOKEN: "t", GH_REPO: "a/b/../c" }, inputs),
    ).toThrow();
    expect(() =>
      buildDispatchRequest({ GH_DISPATCH_TOKEN: "t", GH_REPO: "nope" }, inputs),
    ).toThrow();
  });

  it("formats the local command", () => {
    expect(localScrapeCommand(inputs)).toBe(
      "pnpm scrape --product p1 --merchant m1 --run-id r1 --trigger manual",
    );
  });
});
