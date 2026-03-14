import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { CAPSCurriculumArgsSchema, GetCapsDocumentsArgsSchema, GetCapsSubjectsArgsSchema } from '../schemas.ts';
import type { JsonRecord } from '../types.ts';

export function mapGradeToRange(grade: string): string {
  const raw = String(grade || '').trim();
  const upper = raw.toUpperCase();
  const normalized = upper.replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, '');
  if (/^(R-3|4-6|7-9|10-12)$/.test(normalized)) return normalized;
  if (normalized === 'R' || /^(0|1|2|3)$/.test(normalized)) return 'R-3';
  if (/^[4-6]$/.test(normalized)) return '4-6';
  if (/^[7-9]$/.test(normalized)) return '7-9';
  if (/^(10|11|12)$/.test(normalized)) return '10-12';

  const cleaned = normalized.replace(/[^0-9R-]/g, '');
  if (/^(R-3|4-6|7-9|10-12)$/.test(cleaned)) return cleaned;
  if (cleaned === 'R' || /^(0|1|2|3)$/.test(cleaned)) return 'R-3';
  if (/^[4-6]$/.test(cleaned)) return '4-6';
  if (/^[7-9]$/.test(cleaned)) return '7-9';
  if (/^(10|11|12)$/.test(cleaned)) return '10-12';
  return normalized || raw;
}

export function normalizeSubjectForIlike(subject: string): string {
  const lower = String(subject || '').toLowerCase();
  if (!lower) return '';
  if (lower.includes('math')) return 'math';
  if (lower.includes('english')) return 'english';
  if (lower.includes('afrikaans')) return 'afrikaans';
  if (lower.includes('physical')) return 'physical';
  if (lower.includes('life science')) return 'life';
  if (lower.includes('life skills')) return 'life skills';
  if (lower.includes('social') || /\bss\b/.test(lower)) return 'social';
  if (lower.includes('geograph') || lower === 'geo') return 'geograph';
  if (lower.includes('history')) return 'history';
  if (lower.includes('technology') || lower.includes('tech')) return 'tech';
  return lower;
}

export function augmentCapsSearchQuery(query: string, subject?: string): string {
  const base = String(query || '').trim();
  const s = String(subject || '').toLowerCase();
  if (!base || !s) return base;

  const synonyms: string[] = [];
  if (/(social|\bss\b)/i.test(s)) synonyms.push('"social sciences"', '"social science"', 'geography', 'history');
  if (/geograph/i.test(s)) synonyms.push('geography', '"social sciences"');
  if (/math/i.test(s)) synonyms.push('mathematics', 'math');
  if (/english/i.test(s)) synonyms.push('english');
  return [base, ...synonyms].filter(Boolean).join(' ');
}

export async function searchCapsCurriculumTool(
  supabase: any,
  args: z.infer<typeof CAPSCurriculumArgsSchema>,
): Promise<JsonRecord> {
  const rawQuery = String(args.query || args.search_query || '').trim();
  const limit = Math.min(Number(args.limit || 10) || 10, 50);
  const gradeRange = args.grade ? mapGradeToRange(args.grade) : null;
  const normalizedSubject = args.subject ? normalizeSubjectForIlike(args.subject) : null;
  const augmentedQuery = augmentCapsSearchQuery(rawQuery, args.subject);

  try {
    const { data, error } = await supabase.rpc('search_caps_curriculum', {
      search_query: augmentedQuery,
      search_grade: gradeRange,
      // Equality filter in SQL is strict; use query augmentation + post-filtering instead.
      search_subject: null,
      result_limit: limit,
    });

    if (!error && Array.isArray(data)) {
      let docs = (data as any[]).map((row) => ({
        id: row.id,
        title: row.title,
        grade: row.grade,
        subject: row.subject,
        document_type: row.document_type,
        content_preview: row.content_preview,
        file_url: row.file_url,
        relevance_rank: row.relevance_rank,
      }));

      if (args.document_type) {
        docs = docs.filter((d) => String(d.document_type || '').toLowerCase() === String(args.document_type).toLowerCase());
      }
      if (normalizedSubject) {
        docs = docs.filter((d) => String(d.subject || '').toLowerCase().includes(normalizedSubject));
      }

      return {
        success: true,
        found: docs.length > 0,
        query: rawQuery,
        count: docs.length,
        documents: docs,
        grade: gradeRange,
        subject: args.subject || null,
        source: 'rpc.search_caps_curriculum',
      };
    }
  } catch {
    // Fall through to basic query
  }

  // Fallback: basic filter on caps_documents (no full-text ranking)
  try {
    let qb = supabase
      .from('caps_documents')
      .select('id, title, grade, subject, document_type, file_url, source_url, year, term, description, metadata')
      .limit(limit);

    if (gradeRange) qb = qb.eq('grade', gradeRange);
    if (args.document_type) qb = qb.eq('document_type', args.document_type);
    if (normalizedSubject) qb = qb.ilike('subject', `%${normalizedSubject}%`);
    if (rawQuery) {
      // PostgREST `.or()` uses commas as separators; sanitize user query to avoid parse errors.
      const safe = rawQuery.replace(/[%_,]/g, ' ').trim();
      if (safe) qb = qb.or(`title.ilike.%${safe}%,subject.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data, error } = await qb;
    if (error) {
      return { success: false, error: 'caps_search_failed', details: error.message || error };
    }

    const docs = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      grade: row.grade,
      subject: row.subject,
      document_type: row.document_type,
      file_url: row.file_url,
      source_url: row.source_url,
      year: row.year,
      term: row.term,
      description: row.description,
      metadata: row.metadata,
    }));

    return {
      success: true,
      found: docs.length > 0,
      query: rawQuery,
      count: docs.length,
      documents: docs,
      grade: gradeRange,
      subject: args.subject || null,
      source: 'table.caps_documents',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_search_failed', details: message };
  }
}

export async function getCapsDocumentsTool(
  supabase: any,
  args: z.infer<typeof GetCapsDocumentsArgsSchema>,
): Promise<JsonRecord> {
  const gradeRange = mapGradeToRange(args.grade);
  const normalizedSubject = normalizeSubjectForIlike(args.subject);
  const limit = Math.min(Number(args.limit || 20) || 20, 50);

  try {
    let qb = supabase
      .from('caps_documents')
      .select('id, title, grade, subject, document_type, file_url, source_url, year, term, description, metadata')
      .eq('grade', gradeRange)
      .ilike('subject', `%${normalizedSubject}%`)
      .limit(limit);

    if (args.document_type) qb = qb.eq('document_type', args.document_type);

    const { data, error } = await qb;
    if (error) {
      return { success: false, error: 'caps_documents_failed', details: error.message || error };
    }

    return {
      success: true,
      grade: gradeRange,
      subject: args.subject,
      count: (data || []).length,
      documents: data || [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_documents_failed', details: message };
  }
}

export async function getCapsSubjectsTool(
  supabase: any,
  args: z.infer<typeof GetCapsSubjectsArgsSchema>,
): Promise<JsonRecord> {
  const gradeRange = mapGradeToRange(args.grade);

  try {
    const { data, error } = await supabase
      .from('caps_documents')
      .select('subject')
      .eq('grade', gradeRange);

    if (error) {
      return { success: false, error: 'caps_subjects_failed', details: error.message || error };
    }

    const subjects = Array.from(new Set((data || []).map((d: any) => d.subject).filter(Boolean)));
    return {
      success: true,
      grade: gradeRange,
      count: subjects.length,
      subjects,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_subjects_failed', details: message };
  }
}
