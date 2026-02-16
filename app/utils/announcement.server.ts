import type { AnnouncementBar } from "../types/announcement";

export function parseBars(json: string | null): AnnouncementBar[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((bar: any) => ({
        id: typeof bar.id === "string" ? bar.id : crypto.randomUUID(),

        text: typeof bar.text === "string" ? bar.text : "",

        backgroundColor:
          typeof bar.backgroundColor === "string"
            ? bar.backgroundColor
            : "#000000",

        textColor:
          typeof bar.textColor === "string"
            ? bar.textColor
            : "#ffffff",

        startDate:
          typeof bar.startDate === "string" ? bar.startDate : null,

        endDate:
          typeof bar.endDate === "string" ? bar.endDate : null,

        enabled: typeof bar.enabled === "boolean" ? bar.enabled : true,

        dismissible:
          typeof bar.dismissible === "boolean" ? bar.dismissible : true,
      }))
      .filter((bar) => bar.text.trim().length > 0);

  } catch {
    return [];
  }
}
