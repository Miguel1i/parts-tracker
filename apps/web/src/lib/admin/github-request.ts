export type DispatchInputs = { productId: string; merchantId: string; runId: string };

type Env = Record<string, string | undefined>;

export type DispatchRequest = {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
};

export function localScrapeCommand({ productId, merchantId, runId }: DispatchInputs) {
  return `pnpm scrape --product ${productId} --merchant ${merchantId} --run-id ${runId} --trigger manual`;
}

/** Null when dispatching isn't configured (token or repo missing). Throws on a malformed repo. */
export function buildDispatchRequest(env: Env, inputs: DispatchInputs): DispatchRequest | null {
  const token = env.GH_DISPATCH_TOKEN?.trim();
  // On Vercel the linked Git repo is known, so GH_REPO is only needed elsewhere.
  const vercelRepo =
    env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
      ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
      : undefined;
  const repo = env.GH_REPO?.trim() || vercelRepo;
  if (!token || !repo) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("GH_REPO must look like owner/name");
  return {
    url: `https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/dispatches`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: env.GH_DISPATCH_REF?.trim() || "main",
        inputs: { productId: inputs.productId, merchantId: inputs.merchantId, runId: inputs.runId },
      }),
    },
  };
}
