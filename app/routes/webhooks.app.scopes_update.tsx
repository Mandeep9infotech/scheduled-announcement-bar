import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload, session, topic, shop } =
      await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];

    if (session) {
      await db.session.update({
        where: { id: session.id },
        data: {
          scope: current.join(","),
        },
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Scopes update webhook error:", error);
    return new Response("Webhook error", { status: 200 });
  }
};
