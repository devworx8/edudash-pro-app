import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeText } from './examUtils.ts';

const STUDY_MATERIAL_MARKER = 'study material extracted from uploaded images/pdfs:';
const MAX_STUDY_MATERIAL_BLOCKS = 5;
const MAX_STUDY_MATERIAL_SUMMARY_LENGTH = 2400;

export type UploadedStudyMaterial = {
  sourceName: string;
  summary: string;
};

type StoredStudyMaterialRow = {
  source_name: string | null;
  summary_text: string | null;
};

function stripNumberPrefix(line: string): string {
  return line.replace(/^\(?\d+\)?[.)\-:\s]+/, '').trim();
}

function stripInlineTranslationNoise(line: string): string {
  return line
    .replace(/\((?:teacher|class|translation|english)\s*:[^)]*\)/gi, '')
    .replace(/\[(?:teacher|class|translation|english)\s*:[^\]]*\]/gi, '')
    .trim();
}

function isMaterialHeadingLine(line: string): boolean {
  const normalized = stripNumberPrefix(line).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(normalized);
}

function isLikelyMaterialMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  if (/^part\s+\d+$/i.test(trimmed)) return true;
  return isMaterialHeadingLine(trimmed);
}

function extractStudyMaterialBody(customPrompt?: string): string | null {
  const raw = String(customPrompt || '').trim();
  if (!raw) return null;

  const markerIndex = raw.toLowerCase().indexOf(STUDY_MATERIAL_MARKER);
  if (markerIndex === -1) return null;

  let block = raw.slice(markerIndex + STUDY_MATERIAL_MARKER.length);
  const lowerBlock = block.toLowerCase();
  const stopMarkers = [
    '\n\nkeep all learner-facing content strictly in',
    '\n\nwhen generated content includes non-english terminology',
    '\n\nadditional learner requirements:',
  ];

  let cutIndex = block.length;
  for (const stopMarker of stopMarkers) {
    const idx = lowerBlock.indexOf(stopMarker);
    if (idx >= 0) cutIndex = Math.min(cutIndex, idx);
  }
  block = block.slice(0, cutIndex).trim();
  return block || null;
}

export function parseUploadedStudyMaterials(customPrompt?: string): UploadedStudyMaterial[] {
  const block = extractStudyMaterialBody(customPrompt);
  if (!block) return [];

  const chunks = block
    .split(/\n\s*---\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const materialBlocks: UploadedStudyMaterial[] = [];
  for (const chunk of chunks) {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    let sourceName = 'Uploaded material';
    const contentLines: string[] = [];

    for (const line of lines) {
      if (/^source:\s*/i.test(line)) {
        const parsedSource = line.replace(/^source:\s*/i, '').trim();
        if (parsedSource) sourceName = parsedSource;
        continue;
      }

      const cleaned = stripInlineTranslationNoise(stripNumberPrefix(line))
        .replace(/^[-*•]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned || isLikelyMaterialMetaLine(cleaned)) continue;
      contentLines.push(cleaned);
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const line of contentLines) {
      const normalized = normalizeText(line);
      if (!normalized || normalized.length < 4 || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(line);
    }

    if (deduped.length === 0) continue;

    materialBlocks.push({
      sourceName: sourceName.slice(0, 120),
      summary: deduped.join('\n').slice(0, MAX_STUDY_MATERIAL_SUMMARY_LENGTH),
    });

    if (materialBlocks.length >= MAX_STUDY_MATERIAL_BLOCKS) break;
  }

  return materialBlocks;
}

export function formatStudyMaterialPromptBlock(materials: UploadedStudyMaterial[]): string | null {
  if (materials.length === 0) return null;
  const chunks = materials.map((material) => `Source: ${material.sourceName}\n${material.summary}`);
  return `Study material extracted from uploaded images/PDFs:\n${chunks.join('\n\n---\n\n')}`;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadStoredStudyMaterials(
  supabase: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    studentScope: string;
    subject: string;
    grade: string;
  },
): Promise<UploadedStudyMaterial[]> {
  const queryRows = async (scopeKey: string): Promise<StoredStudyMaterialRow[]> => {
    const { data, error } = await supabase
      .from('exam_study_materials')
      .select('source_name, summary_text')
      .eq('auth_user_id', params.authUserId)
      .eq('student_scope', scopeKey)
      .eq('subject', params.subject)
      .eq('grade', params.grade)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(12);

    if (error) {
      console.warn('[generate-exam] study material memory query failed', error.message);
      return [];
    }

    return (data || []) as StoredStudyMaterialRow[];
  };

  let rows = await queryRows(params.studentScope);
  if (rows.length === 0 && params.studentScope) {
    rows = await queryRows('');
  }

  const materials: UploadedStudyMaterial[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const summary = String(row.summary_text || '').trim();
    if (!summary) continue;
    const normalized = normalizeText(summary);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    materials.push({
      sourceName: String(row.source_name || 'Saved study material').slice(0, 120),
      summary: summary.slice(0, MAX_STUDY_MATERIAL_SUMMARY_LENGTH),
    });
    if (materials.length >= 3) break;
  }

  return materials;
}

export async function persistUploadedStudyMaterials(
  supabase: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    studentId: string | null;
    schoolId: string | null;
    grade: string;
    subject: string;
    language: string;
    examId: string | null;
    materials: UploadedStudyMaterial[];
  },
): Promise<void> {
  if (params.materials.length === 0) return;

  const studentScope = params.studentId || '';
  const nowIso = new Date().toISOString();
  const rows = [];

  for (const material of params.materials.slice(0, MAX_STUDY_MATERIAL_BLOCKS)) {
    const summary = String(material.summary || '').trim();
    if (summary.length < 40) continue;
    const hashInput = `${normalizeText(summary)}|${normalizeText(material.sourceName)}|${params.grade}|${params.subject}`;
    const contentHash = await sha256Hex(hashInput);
    rows.push({
      auth_user_id: params.authUserId,
      student_id: params.studentId,
      school_id: params.schoolId,
      student_scope: studentScope,
      grade: params.grade,
      subject: params.subject,
      language: params.language,
      source_name: material.sourceName,
      summary_text: summary,
      content_hash: contentHash,
      last_used_at: nowIso,
      updated_at: nowIso,
      metadata: {
        saved_from: 'generate_exam',
        generated_exam_id: params.examId,
      },
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('exam_study_materials')
    .upsert(rows, { onConflict: 'auth_user_id,student_scope,content_hash' });

  if (error) {
    console.warn('[generate-exam] study material memory upsert failed', error.message);
  }
}
