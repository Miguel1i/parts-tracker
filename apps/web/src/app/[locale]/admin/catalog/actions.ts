"use server";

import { getDb, productIdentifiers, products } from "@parts/db";
import { eq } from "@parts/db/orm";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import { adminAction } from "@/lib/auth/guard";

const idInput = z.object({ id: z.string().min(1) });

export const setProductArchived = adminAction(
  z.object({ id: z.string().min(1), archived: z.boolean() }),
  async ({ id, archived }, { actor }) => {
    const db = getDb();
    await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, id));
      if (!product) throw new Error("Product not found");
      await tx.update(products).set({ archived }).where(eq(products.id, id));
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: archived ? "product.archive" : "product.unarchive",
        entity: "product",
        entityId: id,
        diff: { name: product.name, archived: [product.archived, archived] },
      });
    });
  },
);

export const confirmIdentifier = adminAction(idInput, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(productIdentifiers).where(eq(productIdentifiers.id, id));
    if (!row) throw new Error("Identifier not found");
    await tx
      .update(productIdentifiers)
      .set({ confirmed: true, confidence: 1 })
      .where(eq(productIdentifiers.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "identifier.confirm",
      entity: "identifier",
      entityId: id,
      diff: { productId: row.productId, kind: row.kind, value: row.value },
    });
  });
});

export const removeIdentifier = adminAction(idInput, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(productIdentifiers).where(eq(productIdentifiers.id, id));
    if (!row) throw new Error("Identifier not found");
    await tx.delete(productIdentifiers).where(eq(productIdentifiers.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "identifier.remove",
      entity: "identifier",
      entityId: id,
      diff: { productId: row.productId, kind: row.kind, value: row.value, source: row.source },
    });
  });
});
