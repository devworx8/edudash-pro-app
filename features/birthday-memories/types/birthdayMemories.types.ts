export type BirthdayMediaType = 'image' | 'video';

export interface BirthdayMemoryEvent {
  id: string;
  birthdayStudentId: string;
  eventDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface BirthdayMemoryMedia {
  id: string;
  eventId: string;
  mediaType: BirthdayMediaType;
  storagePath: string;
  previewPath?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface CreateMemoryEventInput {
  birthdayStudentId: string;
  eventDate: string;
}

export interface UploadBirthdayMediaInput {
  eventId: string;
  organizationId: string;
  mediaType: BirthdayMediaType;
  fileUri: string;
  fileName?: string;
  webFile?: Blob | File;
}
