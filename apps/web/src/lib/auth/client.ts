"use client";

import { adminClient, inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./server";

export const authClient = createAuthClient({
  plugins: [adminClient(), magicLinkClient(), inferAdditionalFields<typeof auth>()],
});

export const { useSession, signIn, signOut } = authClient;
