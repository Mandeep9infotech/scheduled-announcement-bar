export interface AnnouncementBar {
  id: string;

  text: string;

  backgroundColor: string;
  textColor: string;

  startDate: string | null;
  endDate: string | null;

  enabled: boolean;

  dismissible: boolean;   // Free feature

  updatedAt: string;      // 🔥 NEW → used to reset dismiss when bar changes
}
