@'
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop.replace(".myshopify.com", "");
  const deepLink = `https://admin.shopify.com/store/${shop}/themes/current/editor?context=apps&activateAppId=bfe23def-0fcd-9f29-ce0d-ed157282f9076ab939c6/announcement-bar`;
  return { deepLink };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const shopResponse = await admin.graphql(`{ shop { id } }`);
  const shopJson = await shopResponse.json();
  const shopId = shopJson.data.shop.id;
  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [{
          namespace: "scheduled_bar",
          key: "settings",
          type: "json",
          value: "[]",
          ownerId: shopId,
        }],
      },
    }
  );
  const { redirect } = await import("react-router");
  throw redirect("/app");
};

export default function Onboarding() {
  const { deepLink } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "60px auto", padding: "40px" }}>
      <h1 style={{ color: "#008060" }}>Welcome to Scheduled Announcement Bar!</h1>
      <p>Follow these steps to add the announcement bar to your store:</p>
      <div style={{ marginBottom: "20px" }}>
        <h3>Step 1 - Add to Theme</h3>
        <p>Click the button below to open your Theme Editor:</p>
        <a href={deepLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Add to Theme</a>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h3>Step 2 - Place the Block</h3>
        <p>In the Theme Editor, find <strong>Announcement Bar</strong> in App Blocks and drag it to your desired position.</p>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h3>Step 3 - Save</h3>
        <p>Click <strong>Save</strong> in the Theme Editor to apply changes.</p>
      </div>
      <div>
        <h3>Step 4 - Go to Dashboard</h3>
        <p>Once done, click below to start scheduling announcements!</p>
        <fetcher.Form method="post">
          <button type="submit" style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
            Go to Dashboard
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
'@ | Out-File -FilePath "app\routes\app.onboarding.tsx" -Encoding UTF8