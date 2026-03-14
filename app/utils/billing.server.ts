import prisma from "../db.server";
import { PLANS, type PlanKey, getPlanLimits } from "./plans";

export { PLANS, getPlanLimits };
export type { PlanKey };

/* =========================================================
   GET SHOP PLAN
========================================================= */
export async function getShopPlan(shop: string): Promise<PlanKey> {
  const record = await prisma.shopPlan.findUnique({ where: { shop } });
  const plan = record?.plan ?? "free";
  return (plan as PlanKey) in PLANS ? (plan as PlanKey) : "free";
}

/* =========================================================
   UPSERT SHOP PLAN
========================================================= */
export async function upsertShopPlan(
  shop: string,
  plan: PlanKey,
  chargeId?: string
) {
  await prisma.shopPlan.upsert({
    where: { shop },
    update: { plan, chargeId: chargeId ?? null, updatedAt: new Date() },
    create: { shop, plan, chargeId: chargeId ?? null },
  });
}
