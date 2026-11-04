type Env = Record<string, string | undefined>;

/**
 * Public origin of the app, for auth callbacks and links in emails. BETTER_AUTH_URL wins when
 * set; on Vercel it falls back to the system variables (the production domain in production,
 * the deployment URL in previews), so it rarely needs setting by hand.
 */
export function siteUrl(env: Env = process.env): string {
  const explicit = env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
      : env.VERCEL_URL;
  if (host?.trim()) return `https://${host.trim().replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
