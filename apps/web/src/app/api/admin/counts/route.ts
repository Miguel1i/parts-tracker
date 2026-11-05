import { getAdminCounts } from "@/lib/admin/queries";
import { evaluateAccess } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/guard";

/** Pending sign-ups/resets and review items, for the rail badges. Admins only (404 otherwise). */
export async function GET() {
  const session = await getSession();
  if (evaluateAccess(session?.user, "admin") !== "ok") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(await getAdminCounts(), { headers: { "Cache-Control": "no-store" } });
}
