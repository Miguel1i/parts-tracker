import "server-only";
import { auditLog, type Db } from "@parts/db";

type Conn = Pick<Db, "insert">;

export type AuditEntry = {
  actorUserId: string;
  /** Dotted verb, e.g. `user.ban`, `merchant.update`, `candidate.approve`. */
  action: string;
  entity:
    "user" | "merchant" | "product" | "identifier" | "candidate" | "invite" | "settings" | "run";
  entityId?: string | null;
  diff?: Record<string, unknown>;
};

/** Records an admin change. Call it inside the same transaction as the change when there is one. */
export async function writeAudit(db: Conn, entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    diff: entry.diff ?? null,
  });
}

/** Only the fields that changed, as `{ field: [before, after] }`. */
export function changes<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) diff[key] = [before[key], value];
  }
  return diff;
}
