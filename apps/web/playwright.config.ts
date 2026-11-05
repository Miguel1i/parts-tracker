import { defineConfig, devices } from "@playwright/test";

/*
 * UI smoke tests. They run against a production build (`next start`) on a throwaway SQLite
 * file (e2e.db at the repo root, recreated by e2e/global-setup.ts), never a real database.
 *   pnpm --filter web build && pnpm --filter web e2e
 */
const PORT = 3100;
const env = {
  TURSO_DATABASE_URL: "file:e2e.db",
  TURSO_AUTH_TOKEN: "",
  BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    { name: "mobile", dependencies: ["setup"], use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env,
  },
});

export { env as e2eEnv };
