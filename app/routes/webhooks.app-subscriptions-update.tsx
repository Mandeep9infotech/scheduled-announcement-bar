import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { upsertShopPlan } from "../utils/billing.server";
import type { PlanKey } from "../utils/plans";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const status = payload?.app_subscription?.status;
  const planHandle = payload?.app_subscription?.name?.toLowerCase() as PlanKey;

  if (status === "ACTIVE" && planHandle && ["starter", "pro"].includes(planHandle)) {
    await upsertShopPlan(shop, planHandle);
  } else if (["CANCELLED", "DECLINED", "EXPIRED", "FROZEN"].includes(status)) {
    await upsertShopPlan(shop, "free");
  }

  return new Response(null, { status: 200 });
};
