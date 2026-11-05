import { describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("prefers BETTER_AUTH_URL, without a trailing slash", () => {
    expect(siteUrl({ BETTER_AUTH_URL: "https://parts.example/", VERCEL_URL: "x.vercel.app" })).toBe(
      "https://parts.example",
    );
  });

  it("uses the production domain in production on Vercel", () => {
    expect(
      siteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "parts-tracker-azure.vercel.app",
        VERCEL_URL: "parts-tracker-abc123.vercel.app",
      }),
    ).toBe("https://parts-tracker-azure.vercel.app");
  });

  it("uses the deployment URL in previews", () => {
    expect(
      siteUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "parts-tracker-azure.vercel.app",
        VERCEL_URL: "parts-tracker-git-x.vercel.app",
      }),
    ).toBe("https://parts-tracker-git-x.vercel.app");
  });

  it("defaults to localhost", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
