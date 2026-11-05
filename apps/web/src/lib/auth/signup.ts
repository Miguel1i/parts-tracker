import type { Role, SignupMode, UserStatus } from "@parts/db/schema";

export type InviteRow = {
  id: string;
  email: string;
  token: string;
  role: Role;
  expiresAt: Date;
  usedAt: Date | null;
};

export type SignupDecision =
  | { ok: true; status: UserStatus; role: Role; inviteId?: string }
  | { ok: false; error: "invite_required" };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * An invite counts only with its secret token (from the invite link), for the same email, unused
 * and unexpired. Emails aren't verified, so the email alone must never be enough: anyone could
 * register an invited address first and take the invite (and its role).
 */
export function usableInvite(
  invites: InviteRow[],
  email: string,
  token: string | undefined,
  now = new Date(),
): InviteRow | undefined {
  if (!token) return undefined;
  const wanted = normalizeEmail(email);
  return invites
    .filter(
      (i) =>
        i.token === token && normalizeEmail(i.email) === wanted && !i.usedAt && i.expiresAt > now,
    )
    .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
}

/**
 * Who may create an account, and in which state.
 * - An invite always wins: active, with the invite's role (invites skip approval).
 * - Accounts created by an admin are active users.
 * - `open` → active user; `approval` → pending user; `invite_only` → refused.
 */
export function decideSignup(args: {
  mode: SignupMode;
  invite: InviteRow | undefined;
  createdByAdmin?: boolean;
}): SignupDecision {
  const { mode, invite, createdByAdmin } = args;
  if (invite) return { ok: true, status: "active", role: invite.role, inviteId: invite.id };
  if (createdByAdmin) return { ok: true, status: "active", role: "user" };
  switch (mode) {
    case "open":
      return { ok: true, status: "active", role: "user" };
    case "approval":
      return { ok: true, status: "pending", role: "user" };
    case "invite_only":
      return { ok: false, error: "invite_required" };
  }
}
