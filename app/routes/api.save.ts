import { authenticate } from "../shopify.server";

export async function action({ request }: { request: Request }) {
  const { admin } = await authenticate.admin(request);
  const data = await request.json();

  const settings = {
    text: data.text,
    backgroundColor: data.backgroundColor,
    textColor: data.textColor,
    startDate: data.startDate,
    endDate: data.endDate,
    enabled: data.enabled,
  };

  // 1️⃣ Get real shop GID
  const shopResponse = await admin.graphql(`
    {
      shop {
        id
      }
    }
  `);

  const shopJson = await shopResponse.json();
  const shopId = shopJson.data.shop.id;

  console.log("SHOP ID:", shopId);

  // 2️⃣ Save metafield
  const saveResponse = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key }
        userErrors { message }
      }
    }
    `,
    {
      variables: {
        metafields: [
          {
            namespace: "scheduled_bar",
            key: "settings",
            type: "json",
            value: JSON.stringify(settings),
            ownerId: shopId,
          },
        ],
      },
    }
  );

  const saveJson = await saveResponse.json();
  console.log("SAVE RESPONSE:", saveJson);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
