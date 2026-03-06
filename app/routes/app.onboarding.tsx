import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop.replace(".myshopify.com", "");
  const deepLink = `https://admin.shopify.com/store/${shop}/themes/current/editor?context=apps&activateAppId=bfe23def-0fcd-9f29-ce0d-ed157282f9076ab939c6/announcement-bar`;
  return { deepLink };
};

export default function Onboarding() {
  const { deepLink } = useLoaderData<typeof loader>();
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
        <h3>Step 4 - Schedule Announcements</h3>
        <p>Come back here to create and schedule your announcements!</p>
        <a href="/app" style={{ display: "inline-block", background: "#f0f0f0", color: "#333", padding: "10px 20px", borderRadius: "8px", textDecoration: "none" }}>Go to Dashboard</a>
      </div>
    </div>
  );
}
