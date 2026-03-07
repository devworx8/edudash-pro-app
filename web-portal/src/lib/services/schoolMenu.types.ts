export interface WeeklyMenuDay {
  date: string; // YYYY-MM-DD
  breakfast: string[];
  lunch: string[];
  snack: string[];
  notes?: string | null;
}

export interface WeeklyMenuDraft {
  week_start_date: string; // YYYY-MM-DD
  days: WeeklyMenuDay[];
}

export interface WeeklyMenuParseResult {
  success: boolean;
  confidence: number;
  lowConfidence: boolean;
  malformed: boolean;
  issues: string[];
  draft: WeeklyMenuDraft;
  rawResponse?: string;
}

export interface PublishWeeklyMenuInput {
  preschoolId: string;
  publishedBy: string;
  draft: WeeklyMenuDraft;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  sourceFile?: {
    fileName: string;
    mimeType: string;
    file?: File;
    uri?: string;
  };
}

export interface AnnouncementAttachmentMenuSource {
  kind: 'menu_source';
  bucket: 'school-menu-uploads';
  path: string;
  file_name: string;
  mime_type: string;
  week_start_date: string;
  uploaded_at: string;
}

export interface AnnouncementAttachmentMenuStructured {
  kind: 'menu_week_structured';
  version: 1;
  week_start_date: string;
  days: WeeklyMenuDay[];
  confidence: number;
  issues?: string[];
}

export interface SchoolDailyMenuRow {
  id: string;
  preschool_id: string;
  menu_date: string;
  week_start_date: string;
  breakfast_items: string[];
  lunch_items: string[];
  snack_items: string[];
  notes: string | null;
  source_upload_path: string | null;
  source_announcement_id: string | null;
  published_by: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}
