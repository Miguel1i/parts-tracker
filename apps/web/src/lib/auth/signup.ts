import type { Role, SignupMode, UserStatus } from "@parts/db/schema";

export type InviteRow = {
  id: string;
  email: string;
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

/** An invite counts only for the same email, unused and unexpired. */
export function usableInvite(
  invites: InviteRow[],
  email: string,
  now = new Date(),
): InviteRow | undefined {
  const wanted = normalizeEmail(email);
  return invites
    .filter((i) => normalizeEmail(i.email) === wanted && !i.usedAt && i.expiresAt > now)
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
