export interface AnnouncementBar {
  id: string;
  text: string;
  backgroundColor: string;
  textColor: string;
  startDate: string | null;
  endDate: string | null;
  enabled: boolean;
  dismissible: boolean;
  updatedAt: string;
  // Pro-only fields
  allowHtml?: boolean;
  pageTargets?: string[]; // e.g. ["/", "/collections/sale", "/products/*"]
}
