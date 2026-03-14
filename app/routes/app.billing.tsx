import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopPlan, upsertShopPlan } from "../utils/billing.server";
import { PLANS, type PlanKey } from "../utils/plans";

/* =========================================================
   LOADER — return current plan + shop info
========================================================= */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Always sync plan from Shopify's active subscription
  const subsRes = await admin.graphql(`{
    currentAppInstallation {
      activeSubscriptions {
        name
        status
      }
    }
  }`);
  const subsJson = await subsRes.json();
  const activeSubs = subsJson.data?.currentAppInstallation?.activeSubscriptions ?? [];
  const activeSub = activeSubs.find((s: any) => s.status === "ACTIVE");

  let syncedPlan: PlanKey = "free";
  if (activeSub) {
    const name = activeSub.name.toLowerCase();
    if (name.includes("pro")) syncedPlan = "pro";
    else if (name.includes("starter")) syncedPlan = "starter";
  }

  // Save synced plan to DB
  await upsertShopPlan(session.shop, syncedPlan);

  return { currentPlan: syncedPlan, shop: session.shop };
};

/* =========================================================
   ACTION — handle downgrade to free
========================================================= */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "downgrade") {
    await upsertShopPlan(session.shop, "free");
    return { success: true };
  }

  return { success: false };
};

/* =========================================================
   COMPONENT
========================================================= */
export default function BillingPage() {
  const { currentPlan, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);

  const shopHandle = (shop as string).replace(".myshopify.com", "");
  const managedPricingUrl = `https://admin.shopify.com/store/${shopHandle}/charges/scheduled-bar-v2/pricing_plans`;

  const plans: {
    key: PlanKey;
    label: string;
    price: string;
    bars: string;
    features: string[];
  }[] = [
    {
      key: "free",
      label: "Free",
      price: "$0",
      bars: "1 bar",
      features: [
        "1 active announcement bar",
        "Full scheduling (start & end dates)",
        "All colors",
        "Dismissible bars",
        "Live preview",
      ],
    },
    {
      key: "starter",
      label: "Starter",
      price: "$4.99/mo",
      bars: "5 bars",
      features: [
        "5 active announcement bars",
        "Full scheduling (start & end dates)",
        "All colors",
        "Dismissible bars",
        "Drag & reorder",
        "Live preview",
      ],
    },
    {
      key: "pro",
      label: "Pro",
      price: "$9.99/mo",
      bars: "Unlimited bars",
      features: [
        "Unlimited announcement bars",
        "Full scheduling (start & end dates)",
        "All colors",
        "Dismissible bars",
        "Drag & reorder",
        "HTML content in bars",
        "Page-level targeting",
        "Live preview",
      ],
    },
  ];

  return (
    <s-page heading="Choose Your Plan">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 0" }}>

        {currentPlan !== "free" && (
          <div style={{ background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 8, marginBottom: 20, fontWeight: 600 }}>
            ✓ You are on the {PLANS[currentPlan as PlanKey].name} plan
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {plans.map((p) => {
            const isCurrent = currentPlan === p.key;
            const isPro = p.key === "pro";
            return (
              <div
                key={p.key}
                style={{
                  border: isCurrent ? "2px solid #008060" : isPro ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: 24,
                  background: isPro ? "#fafafa" : "#ffffff",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {isPro && (
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#6366f1", color: "#fff", padding: "4px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                    MOST POPULAR
                  </div>
                )}
                {isCurrent && (
                  <div style={{ position: "absolute", top: -12, right: 16, background: "#008060", color: "#fff", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                    CURRENT
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: isPro ? "#6366f1" : "#111", marginBottom: 4 }}>{p.price}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>{p.bars}</div>
                <ul style={{ paddingLeft: 18, margin: "0 0 24px", flex: 1 }}>
                  {p.features.map((f) => (
                    <li key={f} style={{ fontSize: 13, marginBottom: 6, color: "#374151" }}>{f}</li>
                  ))}
                </ul>
                <button
                  disabled={isCurrent}
                  onClick={() => {
                    if (p.key === "free") {
                      setShowDowngradeConfirm(true);
                    } else {
                      window.top!.location.href = managedPricingUrl;
                    }
                  }}
                  style={{
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    background: isCurrent ? "#e5e7eb" : isPro ? "#6366f1" : "#008060",
                    color: isCurrent ? "#6b7280" : "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: isCurrent ? "default" : "pointer",
                    width: "100%",
                  }}
                >
                  {isCurrent ? "Current Plan" : p.key === "free" ? "Downgrade to Free" : `Upgrade to ${p.label}`}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <button
            onClick={() => navigate("/app")}
            style={{ background: "none", border: "none", color: "#008060", cursor: "pointer", textDecoration: "underline", fontSize: 14 }}
          >
            ← Back to Announcements
          </button>
        </div>
      </div>

      {/* Downgrade confirmation modal */}
      {showDowngradeConfirm && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "90%", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
            <h3 style={{ marginTop: 0 }}>Downgrade to Free?</h3>
            <p style={{ fontSize: 14, color: "#6b7280" }}>You will lose access to paid features. Your bars over the free limit will no longer be active.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setShowDowngradeConfirm(false)}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDowngradeConfirm(false);
                  window.top!.location.href = managedPricingUrl;
                }}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}
              >
                Downgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}