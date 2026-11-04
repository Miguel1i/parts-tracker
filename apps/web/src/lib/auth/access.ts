/** Pure access rules, shared by the page guards and the Server Action wrappers. */

export type AccessNeed = "user" | "admin";
export type AccessResult = "ok" | "unauthenticated" | "pending" | "banned" | "forbidden";

/** The parts of a session user the rules look at. */
export type AccessUser = {
  id: string;
  role?: string | null;
  status?: string | null;
  banned?: boolean | null;
  banExpires?: Date | string | null;
};

function isBanned(u: AccessUser, now: Date | undefined) {
  if (!u.banned) return false;
  if (!u.banExpires) return true;
  // Read the clock only when it matters (Cache Components flags `new Date()` in prerenders).
  return new Date(u.banExpires) > (now ?? new Date());
}

/**
 * - anonymous → `unauthenticated`
 * - banned (and the ban hasn't expired) → `banned`
 * - not yet approved → `pending`, even for the admin role
 * - `admin` needed but role isn't exactly "admin" → `forbidden`
 */
export function evaluateAccess(
  user: AccessUser | null | undefined,
  need: AccessNeed,
  now?: Date,
): AccessResult {
  if (!user?.id) return "unauthenticated";
  if (isBanned(user, now)) return "banned";
  if (user.status !== "active") return "pending";
  if (need === "admin" && user.role !== "admin") return "forbidden";
  return "ok";
}
