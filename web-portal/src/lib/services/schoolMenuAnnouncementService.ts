import { createClient } from '@/lib/supabase/client';
import type {
  AnnouncementAttachmentMenuSource,
  AnnouncementAttachmentMenuStructured,
  PublishWeeklyMenuInput,
  WeeklyMenuDraft,
} from '@/lib/services/schoolMenu.types';
import { SchoolMenuService } from '@/lib/services/schoolMenuService';
import { isWeeklyMenuBridgeEnabled, isWeeklyMenuDedicatedEnabled } from '@/lib/services/schoolMenuFeatureFlags';

function sanitizeFileName(fileName: string): string {
  return String(fileName || 'menu-upload')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function toDateRangeLabel(weekStartDate: string): string {
  const start = new Date(`${weekStartDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4);
  const startLabel = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const endLabel = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  return `${startLabel} - ${endLabel}`;
}

function renderMenuSummary(draft: WeeklyMenuDraft): string {
  const lines: string[] = [];
  lines.push(`Weekly Menu (${toDateRangeLabel(draft.week_start_date)})`);
  lines.push('');

  for (const day of draft.days) {
    const d = new Date(`${day.date}T00:00:00.000Z`);
    const dayLabel = d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' });
    const breakfast = day.breakfast.length > 0 ? day.breakfast.join(', ') : 'Not provided';
    const lunch = day.lunch.length > 0 ? day.lunch.join(', ') : 'Not provided';
    const snack = day.snack.length > 0 ? day.snack.join(', ') : 'Not provided';

    lines.push(`${dayLabel}`);
    lines.push(`- Breakfast: ${breakfast}`);
    lines.push(`- Lunch: ${lunch}`);
    lines.push(`- Snack: ${snack}`);
    if (day.notes && day.notes.trim().length > 0) {
      lines.push(`- Notes: ${day.notes.trim()}`);
    }
    lines.push('');
  }

  lines.push('You can also open the Menu page to view this week in a structured format.');
  return lines.join('\n');
}

async function uploadSourceFile(params: {
  preschoolId: string;
  weekStartDate: string;
  sourceFile: NonNullable<PublishWeeklyMenuInput['sourceFile']>;
}): Promise<AnnouncementAttachmentMenuSource> {
  const supabase = createClient();
  const fileName = sanitizeFileName(params.sourceFile.fileName);
  const path = `${params.preschoolId}/${params.weekStartDate}/${Date.now()}-${fileName}`;

  let uploadBody: File | Blob;
  if (params.sourceFile.file) {
    uploadBody = params.sourceFile.file;
  } else if (params.sourceFile.uri) {
    const res = await fetch(params.sourceFile.uri);
    uploadBody = await res.blob();
  } else {
    throw new Error('Missing source file payload');
  }

  const { error } = await supabase.storage
    .from('school-menu-uploads')
    .upload(path, uploadBody, {
      contentType: params.sourceFile.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || 'Failed to upload menu file');
  }

  return {
    kind: 'menu_source',
    bucket: 'school-menu-uploads',
    path,
    file_name: params.sourceFile.fileName,
    mime_type: params.sourceFile.mimeType,
    week_start_date: params.weekStartDate,
    uploaded_at: new Date().toISOString(),
  };
}

export class SchoolMenuAnnouncementService {
  static async publishWeeklyMenu(input: PublishWeeklyMenuInput): Promise<{
    announcementId: string | null;
    weekMenu: WeeklyMenuDraft;
  }> {
    const bridgeEnabled = isWeeklyMenuBridgeEnabled();
    const dedicatedEnabled = isWeeklyMenuDedicatedEnabled();

    if (!bridgeEnabled && !dedicatedEnabled) {
      throw new Error('Weekly menu publishing is currently disabled by feature flag.');
    }

    const supabase = createClient();
    const weekStartDate = SchoolMenuService.startOfWeekMonday(input.draft.week_start_date);

    let sourceAttachment: AnnouncementAttachmentMenuSource | null = null;
    if (input.sourceFile) {
      sourceAttachment = await uploadSourceFile({
        preschoolId: input.preschoolId,
        weekStartDate,
        sourceFile: input.sourceFile,
      });
    }

    const structuredAttachment: AnnouncementAttachmentMenuStructured = {
      kind: 'menu_week_structured',
      version: 1,
      week_start_date: weekStartDate,
      days: input.draft.days,
      confidence: 1,
      issues: [],
    };

    const announcementTitle = `Weekly Menu • ${toDateRangeLabel(weekStartDate)}`;
    const summary = renderMenuSummary({
      ...input.draft,
      week_start_date: weekStartDate,
    });

    const attachments: Array<AnnouncementAttachmentMenuSource | AnnouncementAttachmentMenuStructured> = [];
    if (sourceAttachment) {
      attachments.push(sourceAttachment);
    }
    attachments.push(structuredAttachment);

    let announcementId: string | null = null;
    if (bridgeEnabled) {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          preschool_id: input.preschoolId,
          author_id: input.publishedBy,
          title: announcementTitle,
          content: summary,
          target_audience: 'parents',
          priority: input.priority || 'low',
          is_published: true,
          published_at: new Date().toISOString(),
          attachments,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        throw new Error(error?.message || 'Failed to publish weekly menu announcement');
      }
      announcementId = data.id;
    }

    const weekMenu = dedicatedEnabled
      ? await SchoolMenuService.upsertWeekMenu({
          preschoolId: input.preschoolId,
          weekStartDate,
          days: input.draft.days,
          sourceUploadPath: sourceAttachment?.path || null,
          sourceAnnouncementId: announcementId,
        })
      : {
          ...input.draft,
          week_start_date: weekStartDate,
        };

    if (bridgeEnabled && announcementId) {
      try {
        await supabase.functions.invoke('notifications-dispatcher', {
          body: {
            event_type: 'new_announcement',
            preschool_id: input.preschoolId,
            announcement_id: announcementId,
            title: announcementTitle,
            body: 'The weekly menu is now available for parents.',
            target_audience: 'parents',
            priority: input.priority || 'low',
            send_immediately: true,
            metadata: {
              feature: 'weekly_menu',
              week_start_date: weekStartDate,
              platform: 'web',
            },
          },
        });
      } catch {
        // Non-blocking
      }
    }

    return {
      announcementId,
      weekMenu,
    };
  }
}
