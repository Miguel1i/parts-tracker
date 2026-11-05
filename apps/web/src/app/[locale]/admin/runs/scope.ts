import { builds, getDb, merchants, products } from "@parts/db";
import { inArray } from "@parts/db/orm";

type Scope = { productId?: string; merchantId?: string; buildId?: string; legacy?: true };

export type ScopeNames = {
  products: Map<string, string>;
  merchants: Map<string, string>;
  builds: Map<string, string>;
};

/** Looks up display names for every id mentioned by the given run scopes. */
export async function resolveScopeNames(scopes: Scope[]): Promise<ScopeNames> {
  const ids = (key: "productId" | "merchantId" | "buildId") => [
    ...new Set(scopes.flatMap((s) => (s[key] ? [s[key]] : []))),
  ];
  const db = getDb();
  const [p, m, b] = await Promise.all([
    ids("productId").length
      ? db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(inArray(products.id, ids("productId")))
      : [],
    ids("merchantId").length
      ? db
          .select({ id: merchants.id, name: merchants.name })
          .from(merchants)
          .where(inArray(merchants.id, ids("merchantId")))
      : [],
    ids("buildId").length
      ? db
          .select({ id: builds.id, name: builds.name })
          .from(builds)
          .where(inArray(builds.id, ids("buildId")))
      : [],
  ]);
  const map = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));
  return { products: map(p), merchants: map(m), builds: map(b) };
}

/** Parts of a scope as `[kind, name]`; an empty list means "everything". */
export function scopeParts(
  scope: Scope,
  names: ScopeNames,
): { kind: "product" | "merchant" | "build" | "legacy"; name: string }[] {
  const parts: { kind: "product" | "merchant" | "build" | "legacy"; name: string }[] = [];
  if (scope.productId)
    parts.push({ kind: "product", name: names.products.get(scope.productId) ?? scope.productId });
  if (scope.merchantId)
    parts.push({
      kind: "merchant",
      name: names.merchants.get(scope.merchantId) ?? scope.merchantId,
    });
  if (scope.buildId)
    parts.push({ kind: "build", name: names.builds.get(scope.buildId) ?? scope.buildId });
  if (scope.legacy) parts.push({ kind: "legacy", name: "" });
  return parts;
}
