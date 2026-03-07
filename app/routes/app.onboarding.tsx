import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop.replace(".myshopify.com", "");
  return { shop };
};

export default function Onboarding() {
  const { shop } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

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
        </ol>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h3>Step 3 - Save</h3>
        <p>Click <strong>Save</strong> in the Theme Editor to apply changes.</p>
      </div>
      <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>Once you have added the block, start creating announcements:</p>
        <button onClick={() => shopify.navigate("/app")} style={{ background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
          Add Announcements
        </button>
      </div>
    </div>
  );
}