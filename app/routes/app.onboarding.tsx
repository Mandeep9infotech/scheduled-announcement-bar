import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop.replace(".myshopify.com", "");

  const response = await admin.graphql(`
    {
      shop {
        metafield(namespace: "scheduled_bar", key: "settings") {
          value
        }
      }
    }
  `);
  const json = await response.json();
  const hasData = !!json.data.shop.metafield?.value;

  return { shop, hasData };
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
  const { shop, hasData } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [understood, setUnderstood] = useState(false);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "60px auto", padding: "40px" }}>
      <h1 style={{ color: "#008060" }}>Welcome to Scheduled Announcement Bar!</h1>
      <p>Follow these steps to add the announcement bar to your store:</p>

      <div style={{ marginBottom: "20px" }}>
        <h3>Step 1 - Open Theme Editor</h3>
        <p>Click the button below to open your Theme Editor:</p>
        <a href={`https://admin.shopify.com/store/${shop}/themes/current/editor`} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Open Theme Editor</a>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h3>Step 2 - Add App Block</h3>
        <ol style={{ paddingLeft: "20px", lineHeight: "2" }}>
          <li>Click <strong>Add section</strong> in the left sidebar</li>
          <li>Select the <strong>Apps</strong> tab</li>
          <li>Click on <strong>Scheduled Announcement</strong></li>
          <li>Drag it <strong>above the Header</strong> for best results</li>
        </ol>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h3>Step 3 - Save</h3>
        <p>Click <strong>Save</strong> in the Theme Editor to apply changes.</p>
      </div>

      <div style={{ marginBottom: "24px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "16px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "14px" }}>
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
          <span>I have added the Announcement Bar block to my theme and saved it.</span>
        </label>
      </div>

      <div>
        <h3>Step 4 - Go to Dashboard</h3>
        <p>Once done, click below to start scheduling announcements!</p>
        {hasData ? (
          <a href="/app" style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "14px" }}>
            Go to Dashboard
          </a>
        ) : (
          <fetcher.Form method="post">
            <button type="submit" disabled={!understood} style={{ display: "inline-block", background: understood ? "#008060" : "#cccccc", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", cursor: understood ? "pointer" : "not-allowed", fontWeight: "bold", fontSize: "14px" }}>
              Go to Dashboard
            </button>
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}