'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Upload, Save, AlertTriangle } from 'lucide-react';
import { MenuParsingService } from '@/lib/services/menuParsingService';
import { SchoolMenuAnnouncementService } from '@/lib/services/schoolMenuAnnouncementService';
import { SchoolMenuService } from '@/lib/services/schoolMenuService';
import type { WeeklyMenuDay, WeeklyMenuDraft, WeeklyMenuParseResult } from '@/lib/services/schoolMenu.types';

interface CreateWeeklyMenuModalProps {
  preschoolId: string;
  authorId: string;
  onClose: () => void;
  onPublished: () => void;
  /** When provided, modal opens in edit mode with this draft and week pre-filled. */
  initialDraft?: WeeklyMenuDraft | null;
  initialWeekStartDate?: string | null;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return toDateOnly(d);
}

function listToText(value: string[]): string {
  return value.join(', ');
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function CreateWeeklyMenuModal({
  preschoolId,
  authorId,
  onClose,
  onPublished,
  initialDraft = null,
  initialWeekStartDate = null,
}: CreateWeeklyMenuModalProps) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);

  const initialWeek = initialWeekStartDate && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStartDate)
    ? initialWeekStartDate
    : getMonday(new Date());
  const initialDraftValid = initialDraft?.days?.length && initialDraft?.week_start_date;

  const [weekStartDate, setWeekStartDate] = useState<string>(() =>
    initialDraftValid ? SchoolMenuService.startOfWeekMonday(initialDraft.week_start_date) : initialWeek
  );
  const [draft, setDraft] = useState<WeeklyMenuDraft>(() =>
    initialDraftValid
      ? { week_start_date: initialDraft.week_start_date, days: [...initialDraft.days] }
      : SchoolMenuService.buildEmptyWeekDraft(initialWeek)
  );
  const [parseResult, setParseResult] = useState<WeeklyMenuParseResult | null>(null);
  const isEditMode = Boolean(initialDraftValid);
  const initialWeekRef = useRef(weekStartDate);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [allowBlankDays, setAllowBlankDays] = useState(false);
  const [allowIncompleteMeals, setAllowIncompleteMeals] = useState(false);
  const [confirmParseReview, setConfirmParseReview] = useState(false);

  useEffect(() => {
    if (weekStartDate === initialWeekRef.current && isEditMode) return;
    initialWeekRef.current = weekStartDate;
    setDraft(SchoolMenuService.buildEmptyWeekDraft(weekStartDate));
    setParseResult(null);
    setAllowBlankDays(false);
    setAllowIncompleteMeals(false);
    setConfirmParseReview(false);
  }, [weekStartDate, isEditMode]);

  const blankDays = useMemo(() => {
    return draft.days.filter((day) => {
      const notes = (day.notes || '').trim();
      return day.breakfast.length === 0 && day.lunch.length === 0 && day.snack.length === 0 && notes.length === 0;
    });
  }, [draft.days]);

  const incompleteMealDays = useMemo(() => {
    return draft.days.filter((day) => {
      const isCompletelyBlank = day.breakfast.length === 0
        && day.lunch.length === 0
        && day.snack.length === 0
        && (day.notes || '').trim().length === 0;
      if (isCompletelyBlank) return false;
      return day.breakfast.length === 0 || day.lunch.length === 0 || day.snack.length === 0;
    });
  }, [draft.days]);

  const canRunOCR = useMemo(() => {
    if (!sourceFile) return false;
    return sourceFile.type.startsWith('image/') || sourceFile.type === 'application/pdf';
  }, [sourceFile]);

  const updateDay = (date: string, patch: Partial<WeeklyMenuDay>) => {
    setDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) => (day.date === date ? { ...day, ...patch } : day)),
    }));
  };

  const handleParse = async () => {
    if (!sourceFile) {
      setError('Please choose a menu file first.');
      return;
    }

    setParsing(true);
    setError('');
    try {
      const fileDataUrl = await readFileAsDataUrl(sourceFile);
      const imageDataUrl = sourceFile.type.startsWith('image/') ? fileDataUrl : undefined;
      const fileBase64 = fileDataUrl.split(',')[1] || undefined;

      const result = await MenuParsingService.parseWeeklyMenuFromUpload({
        weekStartDate,
        mimeType: sourceFile.type,
        fileName: sourceFile.name,
        imageDataUrl,
        fileBase64,
      });

      setParseResult(result);
      setDraft(result.draft);
      setWeekStartDate(result.draft.week_start_date);
      setAllowIncompleteMeals(false);
      setConfirmParseReview(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Menu parse failed.');
    } finally {
      setParsing(false);
    }
  };

  const handlePublish = async () => {
    if (!draft.days.length) {
      setError('Please provide at least one day in this weekly menu.');
      return;
    }

    if (blankDays.length > 0 && !allowBlankDays) {
      setError('Some days are still blank. Confirm intentional blanks before publishing.');
      return;
    }

    if (incompleteMealDays.length > 0 && !allowIncompleteMeals) {
      setError('Some days are missing breakfast/lunch/snack items. Confirm intentional gaps before publishing.');
      return;
    }

    if (parseResult?.lowConfidence && !confirmParseReview) {
      setError('OCR confidence is low. Please confirm you reviewed and corrected the extracted menu before publishing.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await SchoolMenuAnnouncementService.publishWeeklyMenu({
        preschoolId,
        publishedBy: authorId,
        draft,
        priority: 'low',
        sourceFile: sourceFile
          ? {
              fileName: sourceFile.name,
              mimeType: sourceFile.type || 'application/octet-stream',
              file: sourceFile,
            }
          : undefined,
      });

      onPublished();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to publish weekly menu.');
      setSaving(false);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: 980,
            maxHeight: '92vh',
            overflow: 'auto',
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              background: 'var(--surface-1)',
              zIndex: 1,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {isEditMode ? 'Edit Weekly Menu' : 'Upload Weekly Menu'}
              </h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--textLight)', fontSize: 13 }}>
                {isEditMode ? 'Update the published menu for this week.' : 'Publish a school-wide weekly menu for parents.'}
              </p>
            </div>
            <button className="iconBtn" onClick={onClose}>
              <X className="icon20" />
            </button>
          </div>

          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            {error && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle className="icon16" />
                {error}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr auto',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                  Week Start (Monday)
                </label>
                <input
                  type="date"
                  value={weekStartDate}
                  onChange={(e) => setWeekStartDate(getMonday(new Date(`${e.target.value}T00:00:00.000Z`)))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                  Upload Menu File (JPG/PNG/WebP/PDF)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSourceFile(file);
                    setParseResult(null);
                    setAllowIncompleteMeals(false);
                    setConfirmParseReview(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    fontSize: 14,
                  }}
                />
              </div>

              <button
                className="btn btnSecondary"
                onClick={() => void handleParse()}
                disabled={parsing || !sourceFile}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                title={canRunOCR ? 'Run OCR parse' : 'OCR parsing supports image files and PDFs'}
              >
                <Sparkles className="icon16" />
                {parsing ? 'Parsing...' : 'Parse with Dash OCR'}
              </button>
            </div>

            {sourceFile && !canRunOCR && (
              <div style={{ fontSize: 12, color: 'var(--textLight)' }}>
                Unsupported file type selected. OCR currently supports image files and PDFs.
              </div>
            )}

            {parseResult && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  background: parseResult.lowConfidence ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Parse result: {(parseResult.confidence * 100).toFixed(0)}% confidence
                </div>
                {parseResult.issues.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)' }}>
                    {parseResult.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {parseResult?.lowConfidence && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--textLight)',
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmParseReview}
                  onChange={(e) => setConfirmParseReview(e.target.checked)}
                />
                I reviewed and corrected low-confidence OCR results for this week.
              </label>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              {draft.days.map((day) => {
                const dayDate = new Date(`${day.date}T00:00:00.000Z`);
                const label = dayDate.toLocaleDateString('en-ZA', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                });

                return (
                  <div key={day.date} className="card" style={{ padding: 14, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>{label}</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 10,
                      }}
                    >
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Breakfast</label>
                        <input
                          value={listToText(day.breakfast)}
                          onChange={(e) => updateDay(day.date, { breakfast: textToList(e.target.value) })}
                          placeholder="Porridge, fruit"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            fontSize: 13,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Lunch</label>
                        <input
                          value={listToText(day.lunch)}
                          onChange={(e) => updateDay(day.date, { lunch: textToList(e.target.value) })}
                          placeholder="Rice, chicken stew"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            fontSize: 13,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Snack</label>
                        <input
                          value={listToText(day.snack)}
                          onChange={(e) => updateDay(day.date, { snack: textToList(e.target.value) })}
                          placeholder="Yoghurt, crackers"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Notes (optional)</label>
                      <textarea
                        value={day.notes || ''}
                        onChange={(e) => updateDay(day.date, { notes: e.target.value })}
                        rows={2}
                        placeholder="Allergen notes, substitutions, etc."
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-2)',
                          fontSize: 13,
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {blankDays.length > 0 && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--textLight)',
                }}
              >
                <input
                  type="checkbox"
                  checked={allowBlankDays}
                  onChange={(e) => setAllowBlankDays(e.target.checked)}
                />
                I confirm {blankDays.length} day(s) are intentionally left blank.
              </label>
            )}

            {incompleteMealDays.length > 0 && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--textLight)',
                }}
              >
                <input
                  type="checkbox"
                  checked={allowIncompleteMeals}
                  onChange={(e) => setAllowIncompleteMeals(e.target.checked)}
                />
                I confirm {incompleteMealDays.length} day(s) intentionally have missing meal slots.
              </label>
            )}
          </div>

          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              position: 'sticky',
              bottom: 0,
              background: 'var(--surface-1)',
            }}
          >
            <button className="btn btnSecondary" onClick={onClose} disabled={saving || parsing}>
              Cancel
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => void handlePublish()}
              disabled={saving || parsing}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {saving ? <Upload className="icon16" /> : <Save className="icon16" />}
              {saving ? (isEditMode ? 'Saving...' : 'Publishing...') : (isEditMode ? 'Save changes' : 'Publish Weekly Menu')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
