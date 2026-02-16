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
  const { admin } = await authenticate.admin(request);

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

  return {
    bars: parseBars(raw),
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
  const { bars: loadedBars } = useLoaderData<typeof loader>();

  const [bars, setBars] = useState<AnnouncementBar[]>(loadedBars ?? []);
  const [originalBars, setOriginalBars] = useState<AnnouncementBar[]>(loadedBars ?? []); // ✅ NEW
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingBar, setEditingBar] = useState<AnnouncementBar | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const hasChanges = isDirty;

 // ✅ NEW

  /* =========================================================
     Toast
  ========================================================= */
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Announcements saved successfully");
      setOriginalBars(bars); // ✅ reset baseline after save
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
    [updated[index - 1], updated[index]] = [
      updated[index],
      updated[index - 1],
    ];
    setBars(updated);
    setIsDirty(true);
  }

  function moveBarDown(index: number) {
    if (index === bars.length - 1) return;
    const updated = [...bars];
    [updated[index + 1], updated[index]] = [
      updated[index],
      updated[index + 1],
    ];
    setBars(updated);
    setIsDirty(true);
  }

  /* =========================================================
     CRUD
  ========================================================= */
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
    updatedAt: new Date().toISOString(), // ✅ important
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
    updatedAt: new Date().toISOString(), // ✅ bump version on every save
  };

  setBars((prev) => {
    const exists = prev.find((b) => b.id === updatedBar.id);
    if (exists) {
      return prev.map((b) =>
        b.id === updatedBar.id ? updatedBar : b
      );
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

  if (!bar.startDate || !bar.endDate) {
    return "Disabled";
  }

  const now = Date.now();
  const start = new Date(bar.startDate).getTime();
  const end = new Date(bar.endDate).getTime();

  if (now < start) return "Scheduled";
  if (now > end) return "Expired";

  return "Active";
}

function getStatusMessage(bar: AnnouncementBar) {
  if (!bar.enabled) {
    return "Announcement is disabled";
  }

  if (!bar.startDate || !bar.endDate) {
    return "Please select start and end dates to make this bar active";
  }

  return null;
}

   
  function getStatusColor(status: string) {
  switch (status) {
    case "Active":
      return { bg: "#dcfce7", text: "#166534" }; // green
    case "Scheduled":
      return { bg: "#e0f2fe", text: "#075985" }; // blue
    case "Expired":
      return { bg: "#fee2e2", text: "#991b1b" }; // red
    case "Disabled":
      return { bg: "#f3f4f6", text: "#6b7280" }; // gray
    default:
      return { bg: "#f3f4f6", text: "#6b7280" };
  }
}

  /* =========================================================
     LIST VIEW
  ========================================================= */
  if (mode === "list") {
    return (
      <s-page heading="Announcement Bars">
        <div style={headerStyle}>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <h2 style={{ margin: 0 }}>All Announcements</h2>

    {hasChanges && (
      <span
        style={{
          background: "#fef3c7",
          color: "#92400e",
          padding: "4px 10px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Unsaved changes
      </span>
    )}
  </div>

  <s-button variant="primary" onClick={addNew}>
    Add Announcement
  </s-button>
</div>


        {bars.length === 0 && (
          <div style={{ opacity: 0.6 }}></div>
        )}

        {bars.map((bar, index) => {
  const status = getStatus(bar);
  const colors = getStatusColor(status);

  return (
    <div key={bar.id} style={cardStyle}>
      <div style={cardTop}>

        {/* LEFT SIDE */}
        <div>
          <div style={titleStyle}>
            {bar.text || "Untitled Announcement"}
          </div>

          <div style={dateStyle}>
            {bar.startDate
              ? new Date(bar.startDate).toLocaleDateString()
              : "No start date"}
            {" → "}
            {bar.endDate
              ? new Date(bar.endDate).toLocaleDateString()
              : "No end date"}
          </div>
          {getStatusMessage(bar) && (
  <div style={{
    fontSize: 12,
    color: "#b91c1c",
    marginTop: 6
  }}>
    {getStatusMessage(bar)}
  </div>
)}

        </div>

        {/* RIGHT SIDE */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* STATUS BADGE */}
          <span
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: colors.bg,
              color: colors.text,
            }}
          >
            {status}
          </span>

          {/* REORDER */}
          <s-button size="slim" onClick={() => moveBarUp(index)}>
            ↑
          </s-button>

          <s-button size="slim" onClick={() => moveBarDown(index)}>
            ↓
          </s-button>

          {/* EDIT */}
          <s-button
            variant="tertiary"
            onClick={() => editBar(bar)}
          >
            Edit
          </s-button>

          {/* DELETE */}
          <s-button
  variant="tertiary"
  tone="critical"
  onClick={() => setShowDeleteConfirm(bar.id)}
>
  Delete
</s-button>


        </div>
      </div>
    </div>
  );
})}


        <div style={{ marginTop: 24 }}>
  {bars.length === 0 && (
    <div style={{ textAlign: 'center', color: '#6b7280', padding: 16, marginBottom: 16 }}>
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
      <p style={{ fontSize: 14, color: "#6b7280" }}>
        This action cannot be undone.
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
        <s-button
          variant="secondary"
          onClick={() => setShowDeleteConfirm(null)}
        >
          Cancel
        </s-button>

        <s-button
          variant="primary"
          tone="critical"
          onClick={() => {
            deleteBar(showDeleteConfirm);
            setShowDeleteConfirm(null);
          }}
        >
          Delete
        </s-button>
      </div>
    </div>
  </div>
)}

      </s-page>
    );
  }

  /* =========================================================
     EDIT VIEW
  ========================================================= */
  if (!editingBar) return null;

  return (
    <s-page heading="Edit Announcement">
      <s-section>

        <s-text-field
          label="Announcement Text"
          value={editingBar.text}
          onInput={(e: any) =>
            setEditingBar({ ...editingBar, text: e.target.value })
          }
        />

        <s-text-field
          label="Background Color"
          value={editingBar.backgroundColor}
          onInput={(e: any) =>
            setEditingBar({
              ...editingBar,
              backgroundColor: e.target.value,
            })
          }
        />

        <s-text-field
          label="Text Color"
          value={editingBar.textColor}
          onInput={(e: any) =>
            setEditingBar({
              ...editingBar,
              textColor: e.target.value,
            })
          }
        />

        <div style={{ marginTop: 16 }}>
          <label>Start Date & Time</label>
          <input
            type="datetime-local"
            value={formatDate(editingBar.startDate)}
            onChange={(e) =>
              setEditingBar({
                ...editingBar,
                startDate: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label>End Date & Time</label>
          <input
            type="datetime-local"
            value={formatDate(editingBar.endDate)}
            onChange={(e) =>
              setEditingBar({
                ...editingBar,
                endDate: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>

  <label style={checkboxLabelStyle}>
    <input
      type="checkbox"
      checked={editingBar.enabled}
      onChange={(e) =>
        setEditingBar({
          ...editingBar,
          enabled: e.target.checked,
        })
      }
      style={checkboxStyle}
    />
    Enable announcement
  </label>

  <label style={checkboxLabelStyle}>
    <input
      type="checkbox"
      checked={editingBar.dismissible ?? true}
      onChange={(e) =>
        setEditingBar({
          ...editingBar,
          dismissible: e.target.checked,
        })
      }
      style={checkboxStyle}
    />
    Allow users to dismiss this announcement
  </label>

</div>



        <div
          style={{
            marginTop: 20,
            backgroundColor: editingBar.backgroundColor,
            color: editingBar.textColor,
            padding: 12,
            borderRadius: 8,
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          {editingBar.text || "Live Preview"}
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <s-button variant="primary" onClick={saveBar}>
            Save
          </s-button>

          <s-button onClick={() => setMode("list")}>
            Cancel
          </s-button>
        </div>
      </s-section>
    </s-page>
  );
}

/* =========================================================
   STYLES
========================================================= */

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

const subStyle = {
  fontSize: 13,
  opacity: 0.6,
};

const inputStyle = {
  width: "100%",
  padding: "8px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  marginTop: "4px",
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
