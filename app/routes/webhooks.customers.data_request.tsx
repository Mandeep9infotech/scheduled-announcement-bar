import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  console.log(`Customer data request for ${shop}`, payload);
  return new Response(null, { status: 200 });
};