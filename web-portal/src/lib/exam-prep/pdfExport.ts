/**
 * PDF Export for Exam Prep
 *
 * Converts a markdown exam string (with optional config metadata) into a
 * professionally formatted PDF using jsPDF. The generated PDF includes:
 *   - Branded header ("EduDash Pro – CAPS Aligned Assessment")
 *   - Metadata box (grade, subject, date, duration, total marks)
 *   - Formatted sections (SECTION A, B, …) with headings
 *   - Questions with mark allocations shown in brackets
 *   - Page-number footer on every page
 *   - Memorandum separated onto new pages
 *
 * Returns a Blob so the caller can trigger a download or upload.
 */

import jsPDF from 'jspdf';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExamPdfConfig {
  grade?: string;
  subject?: string;
  examType?: string;
  language?: string;
  duration?: string;
  totalMarks?: number | string;
  title?: string;
  term?: number;
}

// ── Colours (RGB tuples) ───────────────────────────────────────────────────

const PURPLE: [number, number, number] = [124, 58, 237];
const LIGHT_PURPLE: [number, number, number] = [245, 243, 255];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const GREY: [number, number, number] = [100, 100, 100];

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_WIDTH = 210;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 190;
const CONTENT_WIDTH = MARGIN_RIGHT - MARGIN_LEFT;
const PAGE_BOTTOM = 275;

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureSpace(doc: jsPDF, yPos: number, needed: number): number {
  if (yPos + needed > PAGE_BOTTOM) {
    doc.addPage();
    return 20;
  }
  return yPos;
}

function setColour(doc: jsPDF, rgb: [number, number, number]): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

// ── Core export ────────────────────────────────────────────────────────────

/**
 * Generate a formatted PDF from a markdown exam string.
 *
 * @param markdown  Raw markdown content produced by the AI exam generator.
 * @param config    Optional metadata that enriches the PDF header.
 * @returns         A Blob containing the PDF bytes.
 */
export function generateExamPdf(
  markdown: string,
  config: ExamPdfConfig = {},
): Blob {
  const doc = new jsPDF();
  let y = 0;

  // ── 1. Branded header bar ────────────────────────────────────────────────
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, PAGE_WIDTH, 28, 'F');
  setColour(doc, WHITE);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('EduDash Pro - CAPS Aligned Assessment', PAGE_WIDTH / 2, 14, {
    align: 'center',
  });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Empowering Education Through Technology', PAGE_WIDTH / 2, 22, {
    align: 'center',
  });
  y = 36;

  // ── 2. Extract title from markdown (first # heading) or config ─────────
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title =
    config.title || (titleMatch ? titleMatch[1].trim() : 'Practice Examination');

  setColour(doc, BLACK);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PAGE_WIDTH / 2, y, { align: 'center' });
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.5);
  doc.line(40, y + 3, PAGE_WIDTH - 40, y + 3);
  y += 12;

  // ── 3. Metadata box ─────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Attempt to extract duration / marks from markdown if not in config
  const durationFromMd = markdown.match(/Duration[:\s]*(\d+.*?)[\n|]/i);
  const marksFromMd = markdown.match(/Total\s*Marks?[:\s]*(\d+)/i);

  const grade = config.grade || 'N/A';
  const subject = config.subject || 'N/A';
  const duration =
    config.duration ||
    (durationFromMd ? durationFromMd[1].trim() : 'As indicated');
  const totalMarks =
    config.totalMarks?.toString() ||
    (marksFromMd ? marksFromMd[1] : 'As indicated');

  doc.setFillColor(...LIGHT_PURPLE);
  doc.roundedRect(MARGIN_LEFT - 2, y - 4, CONTENT_WIDTH + 4, 30, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setColour(doc, BLACK);

  const metaLines = [
    `Grade: ${grade}        Subject: ${subject}`,
    `Date: ${dateStr}        Duration: ${duration}`,
    `Total Marks: ${totalMarks}${config.term ? `        Term: ${config.term}` : ''}`,
  ];

  metaLines.forEach((line) => {
    doc.text(line, MARGIN_LEFT + 4, y + 2);
    y += 7;
  });

  y += 10;

  // ── 4. Parse and render markdown body ────────────────────────────────────
  const lines = markdown.split('\n');
  let inMemo = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip the title line we already rendered
    if (titleMatch && trimmed === titleMatch[0].trim()) continue;

    // ── Memorandum detection ──────────────────────────────────────────────
    if (
      /MARKING\s+MEMORANDUM|^#+\s*MEMO/i.test(trimmed) ||
      trimmed.toUpperCase().includes('MEMORANDUM')
    ) {
      // Start memo on a new page
      doc.addPage();
      y = 20;
      inMemo = true;

      doc.setFillColor(...PURPLE);
      doc.rect(0, 0, PAGE_WIDTH, 28, 'F');
      setColour(doc, WHITE);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MARKING MEMORANDUM', PAGE_WIDTH / 2, 16, { align: 'center' });
      y = 36;
      setColour(doc, BLACK);
      continue;
    }

    // ── Section headers (## SECTION …) ────────────────────────────────────
    const sectionMatch = trimmed.match(/^##\s+(SECTION\s+[A-Z].*)/i);
    if (sectionMatch) {
      y = ensureSpace(doc, y, 16);
      doc.setFillColor(...LIGHT_PURPLE);
      doc.roundedRect(MARGIN_LEFT - 2, y - 5, CONTENT_WIDTH + 4, 12, 2, 2, 'F');
      setColour(doc, PURPLE);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(sectionMatch[1].toUpperCase(), MARGIN_LEFT + 2, y + 2);
      setColour(doc, BLACK);
      y += 14;
      continue;
    }

    // ── Sub-headings (## / ### not section) ───────────────────────────────
    const subHeadingMatch = trimmed.match(/^#{2,3}\s+(.+)/);
    if (subHeadingMatch && !sectionMatch) {
      y = ensureSpace(doc, y, 12);
      setColour(doc, PURPLE);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(subHeadingMatch[1], MARGIN_LEFT, y);
      setColour(doc, BLACK);
      y += 8;
      continue;
    }

    // ── H1 headings (# …) already handled title; render subsequent ones ──
    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match) {
      y = ensureSpace(doc, y, 14);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(h1Match[1], MARGIN_LEFT, y);
      y += 10;
      continue;
    }

    // ── Horizontal rules ──────────────────────────────────────────────────
    if (/^-{3,}$|^\*{3,}$/.test(trimmed)) {
      y = ensureSpace(doc, y, 6);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_LEFT, y, MARGIN_RIGHT, y);
      y += 6;
      continue;
    }

    // ── Question lines (numbered: "1.", "1.1", "Question 1:") ─────────────
    const questionMatch = trimmed.match(
      /^\*?\*?(?:Question\s+)?(\d+\.?\d*\.?)\*?\*?[:\s]+(.+)/i,
    );
    if (questionMatch) {
      y = ensureSpace(doc, y, 12);
      const qNum = questionMatch[1].replace(/\.$/, '');
      let qText = questionMatch[2];

      // Extract marks
      const marksInQ = qText.match(/\((\d+)\s*marks?\)|\[(\d+)\]/i);
      const marks = marksInQ ? marksInQ[1] || marksInQ[2] : null;
      qText = qText.replace(/\((\d+)\s*marks?\)|\[(\d+)\]/gi, '').trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${qNum}.`, MARGIN_LEFT, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(qText, CONTENT_WIDTH - 30);
      doc.text(wrapped, MARGIN_LEFT + 10, y);

      if (marks) {
        doc.setFont('helvetica', 'italic');
        setColour(doc, GREY);
        doc.text(`[${marks}]`, MARGIN_RIGHT, y, { align: 'right' });
        setColour(doc, BLACK);
      }

      y += wrapped.length * 5 + 4;
      continue;
    }

    // ── Multiple-choice options (A. / a) …) ───────────────────────────────
    const optMatch = trimmed.match(/^([a-dA-D])[.)]\s+(.+)/);
    if (optMatch) {
      y = ensureSpace(doc, y, 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const optText = `${optMatch[1].toUpperCase()}) ${optMatch[2]}`;
      const optLines = doc.splitTextToSize(optText, CONTENT_WIDTH - 20);
      doc.text(optLines, MARGIN_LEFT + 14, y);
      y += optLines.length * 5 + 2;
      continue;
    }

    // ── Bullet points ─────────────────────────────────────────────────────
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      y = ensureSpace(doc, y, 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('\u2022', MARGIN_LEFT + 4, y);
      const bLines = doc.splitTextToSize(bulletMatch[1], CONTENT_WIDTH - 14);
      doc.text(bLines, MARGIN_LEFT + 10, y);
      y += bLines.length * 5 + 2;
      continue;
    }

    // ── Numbered instructions (standalone "1. …") ─────────────────────────
    const instrMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (instrMatch && !questionMatch) {
      y = ensureSpace(doc, y, 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${instrMatch[1]}.`, MARGIN_LEFT + 4, y);
      const iLines = doc.splitTextToSize(instrMatch[2], CONTENT_WIDTH - 14);
      doc.text(iLines, MARGIN_LEFT + 12, y);
      y += iLines.length * 5 + 2;
      continue;
    }

    // ── Bold lines (**text**) ─────────────────────────────────────────────
    if (/^\*\*(.+)\*\*$/.test(trimmed)) {
      y = ensureSpace(doc, y, 7);
      const boldText = trimmed.replace(/\*\*/g, '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const bLines = doc.splitTextToSize(boldText, CONTENT_WIDTH);
      doc.text(bLines, MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      y += bLines.length * 5 + 2;
      continue;
    }

    // ── Empty lines ───────────────────────────────────────────────────────
    if (!trimmed) {
      y += 4;
      continue;
    }

    // ── Default: plain paragraph text ─────────────────────────────────────
    y = ensureSpace(doc, y, 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    // Strip inline bold markers for cleaner output
    const plainText = trimmed.replace(/\*\*(.+?)\*\*/g, '$1');
    const pLines = doc.splitTextToSize(plainText, CONTENT_WIDTH);
    doc.text(pLines, MARGIN_LEFT, y);
    y += pLines.length * 5 + 2;
  }

  // ── 5. Footer with page numbers on every page ───────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_WIDTH / 2, 290, {
      align: 'center',
    });
    doc.text(
      '\u00A9 EduDash Pro \u2022 CAPS-Aligned Resources',
      PAGE_WIDTH / 2,
      294,
      { align: 'center' },
    );
  }

  // ── 6. Return as Blob ───────────────────────────────────────────────────
  return doc.output('blob');
}

/**
 * Convenience: generate the PDF and immediately trigger a browser download.
 */
export function downloadExamPdf(
  markdown: string,
  config: ExamPdfConfig = {},
): void {
  const blob = generateExamPdf(markdown, config);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (config.title || config.subject || 'exam')
    .replace(/[^a-z0-9_-]/gi, '_')
    .substring(0, 80);
  a.download = `${safeName}_${config.grade || 'exam'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
