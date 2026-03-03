import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ParsedExam } from '@/lib/examParser';

type ExportExamPdfParams = {
  exam: ParsedExam;
  childName?: string;
  generatedAt?: Date;
};

type ExportExamPdfResult = {
  ok: boolean;
  message?: string;
};

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toExamPrintHtml(params: ExportExamPdfParams): string {
  const generatedAt = params.generatedAt || new Date();
  const generatedAtText = generatedAt.toLocaleString();
  const title = params.exam?.title || 'Generated Exam';
  const grade = params.exam?.grade ? String(params.exam.grade).replace('grade_', 'Grade ') : 'Grade not set';
  const subject = params.exam?.subject || 'Subject not set';
  const childLine = params.childName ? `<p><strong>Learner:</strong> ${escapeHtml(params.childName)}</p>` : '';
  const sections = Array.isArray(params.exam?.sections) ? params.exam.sections : [];

  const sectionHtml = sections
    .map((section, sectionIndex) => {
      const questions = Array.isArray(section?.questions) ? section.questions : [];
      const questionsHtml = questions
        .map((question, questionIndex) => {
          const questionText = escapeHtml(String(question?.question || ''));
          const marks = Number.isFinite(Number(question?.marks)) ? Number(question?.marks) : 1;
          const rawOptions = Array.isArray(question?.optionObjects)
            ? question.optionObjects.map((option) => option?.text || '')
            : Array.isArray(question?.options)
              ? question.options
              : [];
          const options = rawOptions
            .map((option, optionIndex) => {
              const letter = String.fromCharCode(65 + optionIndex);
              return `<li><span class="opt">${letter}.</span> ${escapeHtml(String(option || ''))}</li>`;
            })
            .join('');

          const answerSpace = question?.type === 'multiple_choice' || question?.type === 'true_false'
            ? ''
            : '<div class="answer-space"></div>';

          return `
            <article class="question">
              <div class="question-header">
                <h4>Question ${questionIndex + 1}</h4>
                <span class="marks">${marks} mark${marks === 1 ? '' : 's'}</span>
              </div>
              <p class="question-text">${questionText}</p>
              ${options ? `<ol class="options">${options}</ol>` : ''}
              ${answerSpace}
            </article>
          `;
        })
        .join('');

      const sectionTitle = escapeHtml(String(section?.title || `Section ${sectionIndex + 1}`));
      const sectionInstructions = escapeHtml(String(section?.instructions || ''));
      const readingPassage = escapeHtml(String(section?.readingPassage || ''));

      return `
        <section class="section">
          <h3>${sectionTitle}</h3>
          ${sectionInstructions ? `<p class="instructions">${sectionInstructions}</p>` : ''}
          ${readingPassage ? `<div class="passage">${readingPassage.replace(/\n/g, '<br/>')}</div>` : ''}
          ${questionsHtml}
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 24px; }
      h1 { margin: 0 0 8px 0; font-size: 26px; }
      h2 { margin: 18px 0 8px 0; font-size: 18px; }
      h3 { margin: 18px 0 8px 0; font-size: 17px; color: #0b3b8a; }
      h4 { margin: 0; font-size: 14px; }
      p { margin: 4px 0; line-height: 1.45; }
      .meta { margin-bottom: 16px; border-bottom: 1px solid #dbe4f2; padding-bottom: 12px; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .section { margin-top: 18px; page-break-inside: avoid; }
      .instructions { color: #334155; font-style: italic; }
      .passage { margin: 8px 0 14px 0; padding: 10px 12px; border: 1px solid #dbe4f2; border-radius: 10px; background: #f8fbff; line-height: 1.55; white-space: normal; }
      .question { margin: 12px 0; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; page-break-inside: avoid; }
      .question-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .marks { font-size: 12px; font-weight: 700; color: #0f766e; }
      .question-text { margin-bottom: 6px; }
      .options { margin: 0; padding-left: 18px; }
      .options li { margin: 3px 0; }
      .opt { font-weight: 700; }
      .answer-space { border: 1px dashed #cbd5e1; border-radius: 8px; min-height: 80px; margin-top: 8px; }
      @page { margin: 18mm 12mm; }
    </style>
  </head>
  <body>
    <header class="meta">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta-grid">
        <p><strong>Grade:</strong> ${escapeHtml(grade)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Generated:</strong> ${escapeHtml(generatedAtText)}</p>
        <p><strong>Total marks:</strong> ${Number(params.exam?.totalMarks || 0)}</p>
      </div>
      ${childLine}
    </header>
    ${sectionHtml}
  </body>
</html>`;
}

export async function exportExamToPdf(params: ExportExamPdfParams): Promise<ExportExamPdfResult> {
  try {
    const html = toExamPrintHtml(params);
    const printResult = await Print.printToFileAsync({
      html,
      base64: Platform.OS === 'web',
    });

    const pdfUri = printResult?.uri
      || (Platform.OS === 'web' && printResult?.base64
        ? `data:application/pdf;base64,${printResult.base64}`
        : '');

    if (!pdfUri) {
      return { ok: false, message: 'PDF export failed: no document URI returned.' };
    }

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.open(pdfUri, '_blank');
      }
      return { ok: true };
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: false, message: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Share exam PDF',
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export this exam right now.';
    return { ok: false, message };
  }
}
