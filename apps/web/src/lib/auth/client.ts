"use client";

import { adminClient, inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./server";

export const authClient = createAuthClient({
  // Always talk to the origin the page was served from: otherwise the client falls back to a
  // BETTER_AUTH_URL inlined at build time, which breaks previews, other ports and domains.
  ...(typeof window !== "undefined" ? { baseURL: window.location.origin } : {}),
  plugins: [adminClient(), usernameClient(), inferAdditionalFields<typeof auth>()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
