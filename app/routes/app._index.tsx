import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import type { AnnouncementBar } from "../types/announcement";
import { parseBars } from "../utils/announcement.server";

/* =========================================================
   LOADER
========================================================= */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

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
  const raw = json.data.shop.metafield?.value;
  const shop = session.shop.replace(".myshopify.com", "");

  return {
    bars: parseBars(raw),
    hasData: !!raw,
    shop,
  };
};

/* =========================================================
   ACTION
========================================================= */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const bars: AnnouncementBar[] = JSON.parse(
    (formData.get("bars") as string) || "[]"
  );

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
            value: JSON.stringify(bars),
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
  const { bars: loadedBars, hasData, shop } = useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"announcements" | "instructions">(
    hasData ? "announcements" : "instructions"
  );
  const [bars, setBars] = useState<AnnouncementBar[]>(loadedBars ?? []);
  const [originalBars, setOriginalBars] = useState<AnnouncementBar[]>(loadedBars ?? []);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingBar, setEditingBar] = useState<AnnouncementBar | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const hasChanges = isDirty;

  /* =========================================================
     Toast
  ========================================================= */
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Announcements saved successfully");
      setOriginalBars(bars);
      setMode("list");
      setIsDirty(false);
    }
  }, [fetcher.data, shopify]);

  /* =========================================================
     Warn Before Leave
  ========================================================= */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges]);

  /* =========================================================
     Reorder
  ========================================================= */
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

  /* =========================================================
     CRUD
  =========================================================  */
  function addNew() {
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
    });
    setMode("edit");
  }

  function editBar(bar: AnnouncementBar) {
    setEditingBar(bar);
    setMode("edit");
  }

  function deleteBar(id: string) {
    setBars((prev) => prev.filter((b) => b.id !== id));
    setIsDirty(true);
  }

  function saveBar() {
    if (!editingBar || !editingBar.text.trim()) return;
    const updatedBar = {
      ...editingBar,
      updatedAt: new Date().toISOString(),
    };
    setBars((prev) => {
      const exists = prev.find((b) => b.id === updatedBar.id);
      if (exists) {
        return prev.map((b) => b.id === updatedBar.id ? updatedBar : b);
      }
      return [...prev, updatedBar];
    });
    setMode("list");
    setIsDirty(true);
  }

  function saveAllToShopify() {
    fetcher.submit(
      { bars: JSON.stringify(bars) },
      { method: "POST" }
    );
  }

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
    if (!bar.startDate || !bar.endDate) return "Please select start and end dates to make this bar active";
    return null;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "Active": return { bg: "#dcfce7", text: "#166534" };
      case "Scheduled": return { bg: "#e0f2fe", text: "#075985" };
      case "Expired": return { bg: "#fee2e2", text: "#991b1b" };
      case "Disabled": return { bg: "#f3f4f6", text: "#6b7280" };
      default: return { bg: "#f3f4f6", text: "#6b7280" };
    }
  }

  /* =========================================================
     EDIT VIEW
  ========================================================= */
  if (mode === "edit") {
    if (!editingBar) return null;
    return (
      <s-page heading="Edit Announcement">
        <s-section>
          <s-text-field label="Announcement Text" value={editingBar.text} onInput={(e: any) => setEditingBar({ ...editingBar, text: e.target.value })} />
          <s-text-field label="Background Color" value={editingBar.backgroundColor} onInput={(e: any) => setEditingBar({ ...editingBar, backgroundColor: e.target.value })} />
          <s-text-field label="Text Color" value={editingBar.textColor} onInput={(e: any) => setEditingBar({ ...editingBar, textColor: e.target.value })} />

          <div style={{ marginTop: 16 }}>
            <label>Start Date & Time</label>
            <input type="datetime-local" value={formatDate(editingBar.startDate)} onChange={(e) => setEditingBar({ ...editingBar, startDate: e.target.value ? new Date(e.target.value).toISOString() : null })} style={inputStyle} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>End Date & Time</label>
            <input type="datetime-local" value={formatDate(editingBar.endDate)} onChange={(e) => setEditingBar({ ...editingBar, endDate: e.target.value ? new Date(e.target.value).toISOString() : null })} style={inputStyle} />
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={editingBar.enabled} onChange={(e) => setEditingBar({ ...editingBar, enabled: e.target.checked })} style={checkboxStyle} />
              Enable announcement
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={editingBar.dismissible ?? true} onChange={(e) => setEditingBar({ ...editingBar, dismissible: e.target.checked })} style={checkboxStyle} />
              Allow users to dismiss this announcement
            </label>
          </div>

          <div style={{ marginTop: 20, backgroundColor: editingBar.backgroundColor, color: editingBar.textColor, padding: 12, borderRadius: 8, textAlign: "center", fontWeight: 600 }}>
            {editingBar.text || "Live Preview"}
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
     MAIN VIEW (Tabs)
  ========================================================= */
  return (
    <s-page heading="Announcement Bars">

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

      {/* ===================== TAB 1: ANNOUNCEMENTS ===================== */}
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
            <s-button variant="primary" onClick={addNew}>
              Add Announcement
            </s-button>
          </div>

          {bars.map((bar, index) => {
            const status = getStatus(bar);
            const colors = getStatusColor(status);
            return (
              <div key={bar.id} style={cardStyle}>
                <div style={cardTop}>
                  <div>
                    <div style={titleStyle}>{bar.text || "Untitled Announcement"}</div>
                    <div style={dateStyle}>
                      {bar.startDate ? new Date(bar.startDate).toLocaleDateString() : "No start date"}
                      {" → "}
                      {bar.endDate ? new Date(bar.endDate).toLocaleDateString() : "No end date"}
                    </div>
                    {getStatusMessage(bar) && (
                      <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{getStatusMessage(bar)}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: colors.bg, color: colors.text }}>
                      {status}
                    </span>
                    <s-button size="slim" onClick={() => moveBarUp(index)}>↑</s-button>
                    <s-button size="slim" onClick={() => moveBarDown(index)}>↓</s-button>
                    <s-button variant="tertiary" onClick={() => editBar(bar)}>Edit</s-button>
                    <s-button variant="tertiary" tone="critical" onClick={() => setShowDeleteConfirm(bar.id)}>Delete</s-button>
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
            <s-button variant="primary" onClick={saveAllToShopify} loading={fetcher.state === "submitting"} disabled={fetcher.state === "submitting"}>
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
                  <s-button variant="primary" tone="critical" onClick={() => { deleteBar(showDeleteConfirm); setShowDeleteConfirm(null); }}>Delete</s-button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: INSTRUCTIONS ===================== */}
      {activeTab === "instructions" && (
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "32px 0" }}>
          <h2 style={{ color: "#008060" }}>How to Set Up Announcement Bar</h2>
          <p style={{ color: "#6b7280" }}>Follow these steps to add the announcement bar to your store:</p>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 1 - Open Theme Editor</h3>
            <p>Click the button below to open your Theme Editor:</p>
            <a href={`https://admin.shopify.com/store/${shop}/themes/current/editor`} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#008060", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>
              Open Theme Editor
            </a>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 2 - Add App Block</h3>
            <ol style={{ paddingLeft: "20px", lineHeight: "2" }}>
              <li>Click <strong>Add section</strong> in the left sidebar</li>
              <li>Select the <strong>Apps</strong> tab</li>
              <li>Click on <strong>Scheduled Announcement</strong></li>
            </ol>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h3>Step 3 - Save</h3>
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
const tabContainerStyle = {
  display: "flex",
  gap: 0,
  marginBottom: 24,
  borderBottom: "2px solid #e5e7eb",
};

const activeTabStyle = {
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

const inactiveTabStyle = {
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

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "#ffffff",
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle = {
  fontWeight: 600,
  fontSize: 15,
};

const inputStyle = {
  width: "100%",
  padding: "8px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  marginTop: "4px",
  box-sizing: "border-box",
};

const dateStyle = {
  fontSize: 13,
  marginTop: 4,
  color: "#6b7280",
};

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  cursor: "pointer",
};

const checkboxStyle = {
  width: 16,
  height: 16,
};

const modalOverlayStyle = {
  position: "fixed" as const,
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

const modalStyle = {
  background: "#ffffff",
  padding: "24px",
  borderRadius: "12px",
  width: "400px",
  maxWidth: "90%",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
};