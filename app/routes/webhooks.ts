import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "customers/data_request":
      return new Response();

    case "customers/redact":
      return new Response();

    case "shop/redact":
      return new Response();

    default:
      return new Response();
  }
};