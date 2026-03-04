import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { assertSupabase } from '@/lib/supabase';
import type {
  BirthdayMemoryEvent,
  BirthdayMemoryMedia,
  CreateMemoryEventInput,
  UploadBirthdayMediaInput,
} from '../types/birthdayMemories.types';

const BUCKET_NAME = 'birthday-memories';

type RowRecord = Record<string, unknown>;
type UploadBody = Uint8Array | Blob | File;

function mapEvent(row: RowRecord): BirthdayMemoryEvent {
  return {
    id: String(row.id),
    birthdayStudentId: String(row.birthday_student_id),
    eventDate: String(row.event_date),
    createdAt: String(row.created_at),
  };
}

function mapMedia(row: RowRecord): BirthdayMemoryMedia {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    mediaType: row.media_type as 'image' | 'video',
    storagePath: String(row.storage_path),
    previewPath: (row.preview_path as string | null | undefined) ?? null,
    createdAt: String(row.created_at),
    createdBy: (row.created_by as string | null | undefined) ?? null,
  };
}

function getFileExtension(uri: string, fileName?: string): string {
  const source = fileName || uri;
  const parts = source.split('.');
  if (parts.length < 2) return 'jpg';
  return parts[parts.length - 1].toLowerCase();
}

function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = base64.replace(/\s/g, '');
  const output: number[] = [];

  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str.charAt(i));
    const enc2 = chars.indexOf(str.charAt(i + 1));
    const enc3 = chars.indexOf(str.charAt(i + 2));
    const enc4 = chars.indexOf(str.charAt(i + 3));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output.push(chr1);
    if (enc3 !== 64 && enc3 !== -1) output.push(chr2);
    if (enc4 !== 64 && enc4 !== -1) output.push(chr3);
  }
  return new Uint8Array(output);
}

async function createBodyFromUri(uri: string, webFile?: Blob | File): Promise<UploadBody | null> {
  try {
    if (Platform.OS === 'web') {
      if (webFile) {
        return webFile;
      }

      if (uri.startsWith('data:')) {
        const payload = uri.split(',', 2)[1];
        if (!payload) return null;
        return base64ToUint8Array(payload);
      }

      if (uri.startsWith('blob:')) {
        console.warn('[BirthdayMemories] Blob URI upload requires web file payload.');
        return null;
      }

      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return base64ToUint8Array(base64);
  } catch (error) {
    console.error('[BirthdayMemories] Failed to read file', error);
    return null;
  }
}

export class BirthdayMemoriesService {
  static async listEvents(): Promise<BirthdayMemoryEvent[]> {
    const { data, error } = await assertSupabase().functions.invoke('birthday-memories', {
      body: { action: 'list_events' },
    });

    if (error || !data?.success) {
      console.error('[BirthdayMemories] listEvents failed', error || data);
      return [];
    }

    return ((data.data as unknown[]) || []).map((row) => mapEvent(row as RowRecord));
  }

  static async getOrCreateEvent(input: CreateMemoryEventInput): Promise<BirthdayMemoryEvent | null> {
    const { data, error } = await assertSupabase().functions.invoke('birthday-memories', {
      body: {
        action: 'get_or_create_event',
        payload: {
          birthday_student_id: input.birthdayStudentId,
          event_date: input.eventDate,
        },
      },
    });

    if (error || !data?.success || !data.data) {
      console.error('[BirthdayMemories] getOrCreateEvent failed', error || data);
      return null;
    }

    return mapEvent(data.data);
  }

  static async listMedia(eventId: string): Promise<BirthdayMemoryMedia[]> {
    const { data, error } = await assertSupabase().functions.invoke('birthday-memories', {
      body: { action: 'list_media', payload: { event_id: eventId } },
    });

    if (error || !data?.success) {
      console.error('[BirthdayMemories] listMedia failed', error || data);
      return [];
    }

    return ((data.data as unknown[]) || []).map((row) => mapMedia(row as RowRecord));
  }

  static async getViewUrl(mediaId: string): Promise<string | null> {
    const { data, error } = await assertSupabase().functions.invoke('birthday-memories', {
      body: { action: 'get_view_url', payload: { media_id: mediaId } },
    });

    if (error || !data?.success || !data.url) {
      console.error('[BirthdayMemories] getViewUrl failed', error || data);
      return null;
    }

    return data.url as string;
  }

  static async getDownloadUrl(mediaId: string): Promise<string | null> {
    const { data, error } = await assertSupabase().functions.invoke('birthday-memories', {
      body: { action: 'get_download_url', payload: { media_id: mediaId } },
    });

    if (error || !data?.success || !data.url) {
      console.error('[BirthdayMemories] getDownloadUrl failed', error || data);
      return null;
    }

    return data.url as string;
  }

  static async uploadMedia(input: UploadBirthdayMediaInput): Promise<BirthdayMemoryMedia | null> {
    const extension = getFileExtension(input.fileUri, input.fileName);
    const timestamp = Date.now();
    const safeExt = input.mediaType === 'video' ? extension : 'jpg';
    const fileName = `${timestamp}.${safeExt}`;
    const storagePath = `${input.organizationId}/${input.eventId}/${fileName}`;

    let uploadUri = input.fileUri;
    let contentType = input.mediaType === 'video' ? `video/${safeExt}` : 'image/jpeg';

    if (input.mediaType === 'image' && Platform.OS !== 'web') {
      const processed = await manipulateAsync(
        input.fileUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.8, format: SaveFormat.JPEG }
      );
      uploadUri = processed.uri;
      contentType = 'image/jpeg';
    }

    if (Platform.OS === 'web' && input.webFile && typeof (input.webFile as File).type === 'string' && (input.webFile as File).type) {
      contentType = (input.webFile as File).type;
    }

    const body = await createBodyFromUri(uploadUri, input.webFile);
    if (!body) {
      return null;
    }

    const { error: uploadError } = await assertSupabase().storage
      .from(BUCKET_NAME)
      .upload(storagePath, body, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[BirthdayMemories] upload failed', uploadError);
      return null;
    }

    const { data: userData } = await assertSupabase().auth.getUser();
    const authUserId = userData?.user?.id || null;

    const { data: profileData } = await assertSupabase()
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    const { data: inserted, error: insertError } = await assertSupabase()
      .from('birthday_memory_media')
      .insert({
        event_id: input.eventId,
        organization_id: input.organizationId,
        preschool_id: input.organizationId,
        media_type: input.mediaType,
        storage_path: storagePath,
        preview_path: null,
        created_by: profileData?.id ?? null,
      })
      .select('id, event_id, media_type, storage_path, preview_path, created_at, created_by')
      .single();

    if (insertError || !inserted) {
      console.error('[BirthdayMemories] insert failed', insertError);
      return null;
    }

    return mapMedia(inserted);
  }
}
