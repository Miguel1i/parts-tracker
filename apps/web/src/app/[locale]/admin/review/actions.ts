"use server";

import { blocklist, getDb, matchCandidates, productIdentifiers, productMerchant } from "@parts/db";
import { and, eq } from "@parts/db/orm";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import {
  blocklistExternalId,
  identifiersToConfirm,
  isReport,
  urlsToClear,
} from "@/lib/admin/review";
import { ActionError, adminAction } from "@/lib/auth/guard";

const idInput = z.object({ id: z.string().min(1) });

export const approveCandidate = adminAction(idInput, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(matchCandidates).where(eq(matchCandidates.id, id));
    if (!c) throw new ActionError("notFound");
    if (c.status !== "pending") throw new ActionError("alreadyDecided");
    if (isReport(c.signals)) throw new ActionError("invalid");

    await tx
      .insert(productMerchant)
      .values({
        productId: c.productId,
        merchantId: c.merchantId,
        manualUrl: c.url,
        autoUrlFailures: 0,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [productMerchant.productId, productMerchant.merchantId],
        set: { manualUrl: c.url, autoUrlFailures: 0, enabled: true },
      });

    const identifiers = identifiersToConfirm(c.signals?.page);
    for (const { kind, value } of identifiers) {
      await tx
        .insert(productIdentifiers)
        .values({
          productId: c.productId,
          kind,
          value,
          source: "learned",
          sourceMerchantId: c.merchantId,
          confirmed: true,
          confidence: 1,
        })
        .onConflictDoUpdate({
          target: [productIdentifiers.productId, productIdentifiers.kind, productIdentifiers.value],
          set: { confirmed: true, confidence: 1 },
        });
    }

    await tx.update(matchCandidates).set({ status: "approved" }).where(eq(matchCandidates.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "candidate.approve",
      entity: "candidate",
      entityId: id,
      diff: { productId: c.productId, merchantId: c.merchantId, url: c.url, identifiers },
    });
  });
});

export const rejectCandidate = adminAction(idInput, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(matchCandidates).where(eq(matchCandidates.id, id));
    if (!c) throw new ActionError("notFound");
    if (c.status !== "pending") throw new ActionError("alreadyDecided");

    const externalId = blocklistExternalId(c.signals?.page);
    const pairWhere = and(
      eq(productMerchant.productId, c.productId),
      eq(productMerchant.merchantId, c.merchantId),
    );
    const [pair] = await tx.select().from(productMerchant).where(pairWhere);
    const cleared = pair ? urlsToClear(pair, c.url) : null;
    if (cleared) await tx.update(productMerchant).set(cleared).where(pairWhere);
    await tx.insert(blocklist).values({
      productId: c.productId,
      merchantId: c.merchantId,
      url: c.url,
      name: c.title,
      externalId,
    });
    await tx.update(matchCandidates).set({ status: "rejected" }).where(eq(matchCandidates.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "candidate.reject",
      entity: "candidate",
      entityId: id,
      diff: {
        productId: c.productId,
        merchantId: c.merchantId,
        url: c.url,
        externalId,
        clearedUrls: cleared ? Object.keys(cleared) : [],
      },
    });
  });
});

export const dismissReport = adminAction(idInput, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(matchCandidates).where(eq(matchCandidates.id, id));
    if (!c) throw new ActionError("notFound");
    if (c.status !== "pending") throw new ActionError("alreadyDecided");
    if (!isReport(c.signals)) throw new ActionError("invalid");

    await tx.update(matchCandidates).set({ status: "rejected" }).where(eq(matchCandidates.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "candidate.dismiss",
      entity: "candidate",
      entityId: id,
      diff: { productId: c.productId, merchantId: c.merchantId, url: c.url },
    });
  });
});
