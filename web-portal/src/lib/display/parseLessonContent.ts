/**
 * Parse lesson content JSON for room display (steps and resources).
 * Mirrors logic from app/screens/lesson-viewer.tsx for consistency.
 */

export interface LessonContentParsed {
  lesson_flow?: Array<{
    phase?: string;
    duration?: string;
    title?: string;
    instructions?: string;
    teacher_script?: string;
    activities?: unknown[];
  }>;
  materials?: string[];
  resources?: string[];
}

export interface LessonStepDisplay {
  title: string;
  duration: string;
  description: string;
}

export interface LessonMediaDisplay {
  thumbnail_url?: string | null;
  resources: Array<{ title: string; type?: string; url?: string }>;
}

function toRawText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (!raw || typeof raw !== 'object') return '';
  try {
    return JSON.stringify(raw);
  } catch {
    return '';
  }
}

function parseContent(raw: unknown): LessonContentParsed | null {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null) return raw as LessonContentParsed;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LessonContentParsed;
    } catch {
      return null;
    }
  }
  return null;
}

function parseDurationLabel(title: string): string {
  const m = title.match(/(\d{1,3})\s*(min|mins|minute|minutes)\b/i);
  if (!m) return '10 min';
  return `${m[1]} min`;
}

function parseStepsFromMarkdown(rawText: string): LessonStepDisplay[] {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const steps: LessonStepDisplay[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const pushStep = () => {
    const description = currentLines.join('\n').trim();
    if (!currentTitle && !description) return;
    const title = currentTitle || `Step ${steps.length + 1}`;
    steps.push({
      title,
      duration: parseDurationLabel(title),
      description: description || title,
    });
    currentTitle = '';
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentLines.length > 0) currentLines.push('');
      continue;
    }

    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      pushStep();
      currentTitle = heading[1].trim();
      continue;
    }

    const numbered = trimmed.match(/^\d{1,2}[\.)]\s+(.+)$/);
    if (numbered) {
      pushStep();
      currentTitle = numbered[1].trim().slice(0, 100);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!currentTitle) currentTitle = 'Activity';
      currentLines.push(bullet[1].trim());
      continue;
    }

    currentLines.push(trimmed);
  }

  pushStep();
  if (steps.length > 0) {
    return steps.slice(0, 10);
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 6);
  return paragraphs.map((paragraph, idx) => ({
    title: `Step ${idx + 1}`,
    duration: '10 min',
    description: paragraph,
  }));
}

function parseResourceLines(rawText: string): Array<{ title: string; type?: string; url?: string }> {
  const resources: Array<{ title: string; type?: string; url?: string }> = [];
  const urls = String(rawText || '').match(/https?:\/\/[^\s)]+/g) || [];
  urls.slice(0, 8).forEach((url) => resources.push({ title: url, type: 'link', url }));

  const lines = String(rawText || '').split(/\r?\n/);
  lines.forEach((line) => {
    const m = line.match(/^(materials?|resources?)\s*:\s*(.+)$/i);
    if (!m) return;
    m[2]
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => resources.push({ title: item }));
  });

  return resources;
}

export function extractStepsFromContent(
  content: unknown,
  materialsNeeded?: string[]
): LessonStepDisplay[] {
  const parsed = parseContent(content);
  if (!parsed?.lesson_flow?.length) {
    const fallback = parseStepsFromMarkdown(toRawText(content));
    if (fallback.length > 0) return fallback;
    if (Array.isArray(materialsNeeded) && materialsNeeded.length > 0) {
      return [
        {
          title: 'Materials checklist',
          duration: '5 min',
          description: materialsNeeded.filter(Boolean).join(', '),
        },
      ];
    }
    return [];
  }

  const steps: LessonStepDisplay[] = [];
  for (const phase of parsed.lesson_flow) {
    const title = phase.title || phase.phase || 'Step';
    const duration = phase.duration || '10 min';
    const description =
      phase.instructions || phase.teacher_script || '';
    if (title) {
      steps.push({ title, duration, description });
    }
    if (Array.isArray(phase.activities)) {
      for (const sub of phase.activities) {
        const subTitle =
          typeof sub === 'object' && sub !== null && 'name' in sub
            ? String((sub as { name?: string }).name)
            : typeof sub === 'string'
              ? sub
              : 'Activity';
        steps.push({
          title: subTitle,
          duration: '5 min',
          description: typeof sub === 'object' && sub !== null && 'description' in sub
            ? String((sub as { description?: string }).description || '')
            : '',
        });
      }
    }
  }
  return steps;
}

export function extractMediaFromContent(
  content: unknown,
  thumbnailUrl?: string | null
): LessonMediaDisplay {
  const parsed = parseContent(content);
  const resources: Array<{ title: string; type?: string; url?: string }> = [];

  if (parsed?.materials?.length) {
    parsed.materials.forEach((m) =>
      resources.push({ title: typeof m === 'string' ? m : String(m) })
    );
  }
  if (parsed?.resources?.length) {
    for (const r of parsed.resources) {
      if (typeof r === 'string') {
        resources.push({ title: r });
      } else if (r && typeof r === 'object' && 'title' in r) {
        resources.push({
          title: String((r as { title?: string }).title || 'Resource'),
          type: (r as { type?: string }).type,
          url: (r as { url?: string }).url,
        });
      }
    }
  }

  if (resources.length === 0) {
    resources.push(...parseResourceLines(toRawText(content)));
  }

  const uniqueResources: Array<{ title: string; type?: string; url?: string }> = [];
  const seen = new Set<string>();
  resources.forEach((resource) => {
    const key = `${resource.title}|${resource.url || ''}`.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueResources.push(resource);
  });

  return {
    thumbnail_url: thumbnailUrl || null,
    resources: uniqueResources,
  };
}
