import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import type { AnnouncementBar } from "../types/announcement";
import { parseBars } from "../utils/announcement.server";
import { getShopPlan, getPlanLimits, upsertShopPlan } from "../utils/billing.server";
import { PLANS, type PlanKey } from "../utils/plans";

/* =========================================================
   LOADER
========================================================= */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [metafieldRes, subsRes] = await Promise.all([
    admin.graphql(`{
      shop {
        metafield(namespace: "scheduled_bar", key: "settings") {
          value
        }
      }
    }`),
    admin.graphql(`{
      currentAppInstallation {
        activeSubscriptions {
          name
          status
        }
      }
    }`),
  ]);

  // Sync plan from Shopify
  const subsJson = await subsRes.json();
  const activeSubs = subsJson.data?.currentAppInstallation?.activeSubscriptions ?? [];
  const activeSub = activeSubs.find((s: any) => s.status === "ACTIVE");
  let syncedPlan: PlanKey = "free";
  if (activeSub) {
    const name = activeSub.name.toLowerCase();
    if (name.includes("pro")) syncedPlan = "pro";
    else if (name.includes("starter")) syncedPlan = "starter";
  }
  await upsertShopPlan(session.shop, syncedPlan);

  const json = await metafieldRes.json();
  const raw = json.data.shop.metafield?.value;
  const shop = session.shop.replace(".myshopify.com", "");

  return {
    bars: parseBars(raw),
    hasData: !!raw,
    shop,
    plan: syncedPlan,
    limits: getPlanLimits(syncedPlan),
  };
};

/* =========================================================
   ACTION
========================================================= */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const bars: AnnouncementBar[] = JSON.parse(
    (formData.get("bars") as string) || "[]"
  );

  // Enforce bar limit server-side
  const plan = await getShopPlan(session.shop);
  const limits = getPlanLimits(plan);
  const limitedBars =
    limits.barLimit === Infinity ? bars : bars.slice(0, limits.barLimit);

  // Strip Pro-only fields if not on Pro
  const safeBars = limitedBars.map((bar) => {
    if (!limits.allowHtml) delete bar.allowHtml;
    if (!limits.allowPageTargeting) delete bar.pageTargets;
    return bar;
  });

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
        metafields: [
          {
            namespace: "scheduled_bar",
            key: "settings",
            type: "json",
            value: JSON.stringify(safeBars),
            ownerId: shopId,
          },
        ],
      },
    }
  );

  return { success: true };
};

/* =========================================================
   COMPONENT
========================================================= */
export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { bars: loadedBars, hasData, shop, plan, limits } = useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"announcements" | "instructions">(
    hasData ? "announcements" : "instructions"
  );
  const [bars, setBars] = useState<AnnouncementBar[]>(loadedBars ?? []);
  const [originalBars, setOriginalBars] = useState<AnnouncementBar[]>(loadedBars ?? []);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingBar, setEditingBar] = useState<AnnouncementBar | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pageTargetInput, setPageTargetInput] = useState("");

  const hasChanges = isDirty;
  const atBarLimit = limits.barLimit !== Infinity && bars.length >= limits.barLimit;
  const planLabel = PLANS[plan as PlanKey].name;

  /* ── Toast ─────────────────────────────────────────── */
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Announcements saved successfully");
      setOriginalBars(bars);
      setMode("list");
      setIsDirty(false);
    }
  }, [fetcher.data, shopify]);

  /* ── Warn before leave ──────────────────────────────── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  /* ── Reorder ─────────────────────────────────────────── */
  function moveBarUp(index: number) {
    if (index === 0) return;
    const updated = [...bars];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setBars(updated);
    setIsDirty(true);
  }

  function moveBarDown(index: number) {
    if (index === bars.length - 1) return;
    const updated = [...bars];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setBars(updated);
    setIsDirty(true);
  }

  /* ── CRUD ────────────────────────────────────────────── */
  function addNew() {
    if (atBarLimit) return;
    setEditingBar({
      id: crypto.randomUUID(),
      text: "",
      backgroundColor: "#000000",
      textColor: "#ffffff",
      startDate: null,
      endDate: null,
      enabled: true,
      dismissible: true,
      updatedAt: new Date().toISOString(),
      allowHtml: false,
      pageTargets: [],
    });
    setPageTargetInput("");
    setMode("edit");
  }

  function editBar(bar: AnnouncementBar) {
    setEditingBar({ ...bar });
    setPageTargetInput("");
    setMode("edit");
  }

  function deleteBar(id: string) {
    setBars((prev) => prev.filter((b) => b.id !== id));
    setIsDirty(true);
  }

  function saveBar() {
    if (!editingBar || !editingBar.text.trim()) return;
    const updatedBar = { ...editingBar, updatedAt: new Date().toISOString() };
    setBars((prev) => {
      const exists = prev.find((b) => b.id === updatedBar.id);
      if (exists) return prev.map((b) => (b.id === updatedBar.id ? updatedBar : b));
      return [...prev, updatedBar];
    });
    setMode("list");
    setIsDirty(true);
  }

  function saveAllToShopify() {
    fetcher.submit({ bars: JSON.stringify(bars) }, { method: "POST" });
  }

  /* ── Page targets helpers ────────────────────────────── */
  function addPageTarget() {
    const val = pageTargetInput.trim();
    if (!val || !editingBar) return;
    const existing = editingBar.pageTargets ?? [];
    if (!existing.includes(val)) {
      setEditingBar({ ...editingBar, pageTargets: [...existing, val] });
    }
    setPageTargetInput("");
  }

  function removePageTarget(target: string) {
    if (!editingBar) return;
    setEditingBar({
      ...editingBar,
      pageTargets: (editingBar.pageTargets ?? []).filter((t) => t !== target),
    });
  }

  /* ── Formatting helpers ──────────────────────────────── */
  function formatDate(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
  }

  function getStatus(bar: AnnouncementBar) {
    if (!bar.enabled) return "Disabled";
    if (!bar.startDate || !bar.endDate) return "Disabled";
    const now = Date.now();
    const start = new Date(bar.startDate).getTime();
    const end = new Date(bar.endDate).getTime();
    if (now < start) return "Scheduled";
    if (now > end) return "Expired";
    return "Active";
  }

  function getStatusMessage(bar: AnnouncementBar) {
    if (!bar.enabled) return "Announcement is disabled";
    if (!bar.startDate || !bar.endDate)
      return "Please select start and end dates to make this bar active";
    return null;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "Active": return { bg: "#dcfce7", text: "#166534" };
      case "Scheduled": return { bg: "#e0f2fe", text: "#075985" };
      case "Expired": return { bg: "#fee2e2", text: "#991b1b" };
      default: return { bg: "#f3f4f6", text: "#6b7280" };
    }
  }

  /* =========================================================
     EDIT VIEW
  ========================================================= */
  if (mode === "edit") {
    if (!editingBar) return null;
    const previewContent = editingBar.allowHtml && limits.allowHtml
      ? editingBar.text
      : editingBar.text || "Live Preview";

    return (
      <s-page heading="Edit Announcement">
        <s-section>
          {/* Text / HTML */}
          {limits.allowHtml ? (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Announcement Content
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editingBar.allowHtml ?? false}
                    onChange={(e) => setEditingBar({ ...editingBar, allowHtml: e.target.checked })}
                    style={checkboxStyle}
                  />
                  Enable HTML
                </label>
              </label>
              {editingBar.allowHtml ? (
                <textarea
                  value={editingBar.text}
                  onChange={(e) => setEditingBar({ ...editingBar, text: e.target.value })}
                  rows={4}
                  placeholder='e.g. Free shipping on orders over <strong>$50</strong>! <a href="/sale">Shop now →</a>'
                  style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}
                />
              ) : (
                <s-text-field
                  label=""
                  value={editingBar.text}
                  onInput={(e: any) => setEditingBar({ ...editingBar, text: e.target.value })}
                />
              )}
            </div>
          ) : (
            <s-text-field
              label="Announcement Text"
              value={editingBar.text}
              onInput={(e: any) => setEditingBar({ ...editingBar, text: e.target.value })}
            />
          )}

          {/* Colors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <label style={labelStyle}>Background Color</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={editingBar.backgroundColor}
                  onChange={(e) => setEditingBar({ ...editingBar, backgroundColor: e.target.value })}
                  style={{ width: 44, height: 36, padding: 2, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={editingBar.backgroundColor}
                  onChange={(e) => setEditingBar({ ...editingBar, backgroundColor: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Text Color</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={editingBar.textColor}
                  onChange={(e) => setEditingBar({ ...editingBar, textColor: e.target.value })}
                  style={{ width: 44, height: 36, padding: 2, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={editingBar.textColor}
                  onChange={(e) => setEditingBar({ ...editingBar, textColor: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <label style={labelStyle}>Start Date & Time</label>
              <input
                type="datetime-local"
                value={formatDate(editingBar.startDate)}
                onChange={(e) =>
                  setEditingBar({
                    ...editingBar,
                    startDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date & Time</label>
              <input
                type="datetime-local"
                value={formatDate(editingBar.endDate)}
                onChange={(e) =>
                  setEditingBar({
                    ...editingBar,
                    endDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                style={inputStyle}
              />
            </div>
          </div>

          {/* Toggles */}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={editingBar.enabled}
                onChange={(e) => setEditingBar({ ...editingBar, enabled: e.target.checked })}
                style={checkboxStyle}
              />
              Enable announcement
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={editingBar.dismissible ?? true}
                onChange={(e) => setEditingBar({ ...editingBar, dismissible: e.target.checked })}
                style={checkboxStyle}
              />
              Allow users to dismiss this announcement
            </label>
          </div>

          {/* Page Targeting (Pro only) */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={labelStyle}>Page Targeting</label>
              {!limits.allowPageTargeting && (
                <span
                  onClick={() => navigate("/app/billing")}
                  style={upgradeBadgeStyle}
                >
                  ✦ Pro feature — Upgrade
                </span>
              )}
            </div>
            {limits.allowPageTargeting ? (
              <div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
                  Leave empty to show on all pages. Use paths like{" "}
                  <code>/</code>, <code>/collections/sale</code>, <code>/products/*</code>
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={pageTargetInput}
                    onChange={(e) => setPageTargetInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPageTarget()}
                    placeholder="/collections/sale"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={addPageTarget} style={addBtnStyle}>Add</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {(editingBar.pageTargets ?? []).map((t) => (
                    <span key={t} style={tagStyle}>
                      {t}
                      <button onClick={() => removePageTarget(t)} style={tagRemoveStyle}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8, padding: 12, color: "#9ca3af", fontSize: 13 }}>
                Show this bar only on specific pages — available on the Pro plan.
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div style={{ marginTop: 24 }}>
            <label style={labelStyle}>Live Preview</label>
            {editingBar.allowHtml && limits.allowHtml ? (
              <div
                style={{
                  backgroundColor: editingBar.backgroundColor,
                  color: editingBar.textColor,
                  padding: "12px 40px 12px 12px",
                  borderRadius: 8,
                  textAlign: "center",
                  fontWeight: 600,
                  position: "relative",
                }}
                dangerouslySetInnerHTML={{ __html: previewContent }}
              />
            ) : (
              <div
                style={{
                  backgroundColor: editingBar.backgroundColor,
                  color: editingBar.textColor,
                  padding: "12px 40px 12px 12px",
                  borderRadius: 8,
                  textAlign: "center",
                  fontWeight: 600,
                  position: "relative",
                }}
              >
                {previewContent}
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <s-button variant="primary" onClick={saveBar}>Save</s-button>
            <s-button onClick={() => setMode("list")}>Cancel</s-button>
          </div>
        </s-section>
      </s-page>
    );
  }

  /* =========================================================
     MAIN VIEW
  ========================================================= */
  return (
    <s-page heading="Announcement Bars">

      {/* Plan banner */}
      <div style={planBannerStyle}>
        <span>
          Current plan: <strong>{planLabel}</strong>
          {" · "}
          {limits.barLimit === Infinity
            ? "Unlimited bars"
            : `${bars.length} / ${limits.barLimit} bars used`}
        </span>
        <button onClick={() => navigate("/app/billing")} style={managePlanBtnStyle}>
          {plan === "free" ? "⬆ Upgrade Plan" : "Manage Plan"}
        </button>
      </div>

      {/* TABS */}
      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveTab("announcements")}
          style={activeTab === "announcements" ? activeTabStyle : inactiveTabStyle}
        >
          Add Announcements
        </button>
        <button
          onClick={() => setActiveTab("instructions")}
          style={activeTab === "instructions" ? activeTabStyle : inactiveTabStyle}
        >
          View Instructions
        </button>
      </div>

      {/* ── TAB 1: ANNOUNCEMENTS ── */}
      {activeTab === "announcements" && (
        <div>
          <div style={headerStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>All Announcements</h2>
              {hasChanges && (
                <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  Unsaved changes
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {atBarLimit && (
                <span
                  onClick={() => navigate("/app/billing")}
                  style={upgradeBadgeStyle}
                >
                  ✦ Upgrade to add more bars
                </span>
              )}
              <s-button variant="primary" onClick={addNew} disabled={atBarLimit}>
                Add Announcement
              </s-button>
            </div>
          </div>

          {bars.map((bar, index) => {
            const status = getStatus(bar);
            const colors = getStatusColor(status);
            return (
              <div key={bar.id} style={cardStyle}>
                <div style={cardTop}>
                  <div style={{ flex: 1 }}>
                    <div style={titleStyle}>{bar.text || "Untitled Announcement"}</div>
                    <div style={dateStyle}>
                      {bar.startDate ? new Date(bar.startDate).toLocaleDateString() : "No start date"}
                      {" → "}
                      {bar.endDate ? new Date(bar.endDate).toLocaleDateString() : "No end date"}
                    </div>
                    {bar.pageTargets && bar.pageTargets.length > 0 && (
                      <div style={{ fontSize: 11, color: "#6366f1", marginTop: 4 }}>
                        📍 {bar.pageTargets.join(", ")}
                      </div>
                    )}
                    {bar.allowHtml && (
                      <div style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>⟨/⟩ HTML enabled</div>
                    )}
                    {getStatusMessage(bar) && (
                      <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
                        {getStatusMessage(bar)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: colors.bg, color: colors.text }}>
                      {status}
                    </span>
                    <s-button size="slim" onClick={() => moveBarUp(index)}>↑</s-button>
                    <s-button size="slim" onClick={() => moveBarDown(index)}>↓</s-button>
                    <s-button variant="tertiary" onClick={() => editBar(bar)}>Edit</s-button>
                    <s-button variant="tertiary" tone="critical" onClick={() => setShowDeleteConfirm(bar.id)}>
                      Delete
                    </s-button>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 24 }}>
            {bars.length === 0 && (
              <div style={{ textAlign: "center", color: "#6b7280", padding: 16, marginBottom: 16 }}>
                No announcements yet. Click "Add Announcement" to create one.
              </div>
            )}
            <s-button
              variant="primary"
              onClick={saveAllToShopify}
              loading={fetcher.state === "submitting"}
              disabled={fetcher.state === "submitting"}
            >
              Save All Changes
            </s-button>
          </div>

          {showDeleteConfirm && (
            <div style={modalOverlayStyle}>
              <div style={modalStyle}>
                <h3 style={{ marginTop: 0 }}>Delete Announcement?</h3>
                <p style={{ fontSize: 14, color: "#6b7280" }}>This action cannot be undone.</p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
                  <s-button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</s-button>
                  <s-button
                    variant="primary"
                    tone="critical"
                    onClick={() => { deleteBar(showDeleteConfirm); setShowDeleteConfirm(null); }}
                  >
                    Delete
                  </s-button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: INSTRUCTIONS ── */}
      {activeTab === "instructions" && (
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "32px 0" }}>
          <h2 style={{ color: "#008060" }}>How to Set Up Announcement Bar</h2>
          <p style={{ color: "#6b7280" }}>Follow these steps to add the announcement bar to your store:</p>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 1 — Open Theme Editor</h3>
            <a
              href={`https://admin.shopify.com/store/${shop}/themes/current/editor`}
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}
            >
              Open Theme Editor
            </a>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 2 — Add App Block</h3>
            <ol style={{ paddingLeft: "20px", lineHeight: "2" }}>
              <li>Click <strong>Add section</strong> in the left sidebar</li>
              <li>Select the <strong>Apps</strong> tab</li>
              <li>Click on <strong>Scheduled Announcement</strong></li>
            </ol>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 3 — Save</h3>
            <p>Click <strong>Save</strong> in the Theme Editor to apply changes.</p>
          </div>

          <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
            <p style={{ color: "#6b7280", fontSize: "14px" }}>Once done, go create your announcements:</p>
            <button
              onClick={() => setActiveTab("announcements")}
              style={{ background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}
            >
              Go to Announcements
            </button>
          </div>
        </div>
      )}
    </s-page>
  );
}

/* =========================================================
   STYLES
========================================================= */
const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 4,
  color: "#374151",
};

const planBannerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: 8,
  padding: "10px 16px",
  marginBottom: 20,
  fontSize: 14,
};

const managePlanBtnStyle: React.CSSProperties = {
  background: "#008060",
  color: "#fff",
  border: "none",
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const upgradeBadgeStyle: React.CSSProperties = {
  background: "#ede9fe",
  color: "#6d28d9",
  padding: "4px 12px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const tabContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  marginBottom: 24,
  borderBottom: "2px solid #e5e7eb",
};

const activeTabStyle: React.CSSProperties = {
  padding: "10px 24px",
  background: "none",
  border: "none",
  borderBottom: "2px solid #008060",
  color: "#008060",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  marginBottom: "-2px",
};

const inactiveTabStyle: React.CSSProperties = {
  padding: "10px 24px",
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "#6b7280",
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  marginBottom: "-2px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "#ffffff",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 15,
};

const dateStyle: React.CSSProperties = {
  fontSize: 13,
  marginTop: 4,
  color: "#6b7280",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  marginTop: "4px",
  boxSizing: "border-box",
  fontSize: 14,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  cursor: "pointer",
};

const checkboxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
};

const addBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#008060",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tagStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#e0e7ff",
  color: "#3730a3",
  padding: "4px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
};

const tagRemoveStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#6366f1",
  fontWeight: 700,
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: "#ffffff",
  padding: "24px",
  borderRadius: "12px",
  width: "400px",
  maxWidth: "90%",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
};