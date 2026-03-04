import { DashPDFGenerator } from '@/services/DashPDFGenerator';
import { assertSupabase } from '@/lib/supabase';
import { SchoolSettingsService } from '@/lib/services/SchoolSettingsService';
import { Platform } from 'react-native';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReceiptFeeDetails {
  id: string;
  description: string;
  amount: number;
  dueDate?: string | null;
  paidDate: string;
  paymentReference: string;
  paymentMethod: string;
}

export interface ReceiptStudentDetails {
  id: string;
  firstName: string;
  lastName: string;
  className?: string | null;
}

export interface ReceiptParentDetails {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface ReceiptIssuerDetails {
  id: string;
  name: string;
}

export interface ReceiptGenerationRequest {
  schoolId: string;
  fee: ReceiptFeeDetails;
  student: ReceiptStudentDetails;
  parent?: ReceiptParentDetails;
  issuer: ReceiptIssuerDetails;
}

export interface ReceiptGenerationResult {
  storagePath?: string;
  receiptUrl?: string | null;
  filename?: string;
}

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatCurrency = (amount: number): string => `R ${amount.toFixed(2)}`;

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const sanitizeForFilename = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'school';

const timestampForFilename = (): string =>
  new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-');

const hexToRgbSafe = (hex: string): { r: number; g: number; b: number } => {
  const normalized = String(hex || '')
    .replace('#', '')
    .trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return { r: 0.12, g: 0.37, b: 0.99 };
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return { r, g, b };
};

export class ReceiptService {
  private static async createWebReceiptPdfBytes(input: {
    schoolName: string;
    receiptNumber: string;
    studentName: string;
    parentName: string;
    amount: number;
    description: string;
    dueDate?: string | null;
    paidDate: string;
    paymentMethod: string;
    paymentReference: string;
    issuerName: string;
    primaryColor: string;
  }): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const normalFont = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const primary = hexToRgbSafe(input.primaryColor);
    const textColor = rgb(0.10, 0.13, 0.18);
    const mutedColor = rgb(0.39, 0.45, 0.54);
    const left = 52;
    const right = 543;
    const maxTextWidth = right - left;
    let y = 790;

    const drawWrapped = (
      text: string,
      opts: {
        x?: number;
        size?: number;
        lineHeight?: number;
        color?: ReturnType<typeof rgb>;
        font?: typeof normalFont;
      } = {},
    ) => {
      const font = opts.font || normalFont;
      const size = opts.size ?? 11;
      const lineHeight = opts.lineHeight ?? Math.max(14, size + 4);
      const x = opts.x ?? left;
      const color = opts.color || textColor;
      const words = String(text || '').split(/\s+/).filter(Boolean);
      let line = '';
      const lines: string[] = [];

      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxTextWidth) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        line = word;
      }
      if (line) lines.push(line);

      lines.forEach((entry) => {
        page.drawText(entry, { x, y, size, color, font });
        y -= lineHeight;
      });
    };

    page.drawText(input.schoolName, {
      x: left,
      y,
      size: 20,
      color: rgb(primary.r, primary.g, primary.b),
      font: boldFont,
    });
    y -= 28;
    page.drawText('Payment Receipt', { x: left, y, size: 12, color: mutedColor, font: normalFont });
    page.drawText(`Receipt #${input.receiptNumber}`, {
      x: 360,
      y: y + 8,
      size: 11,
      color: mutedColor,
      font: normalFont,
    });
    y -= 16;
    page.drawText(`Issued: ${formatDate(input.paidDate)}`, {
      x: 360,
      y: y + 8,
      size: 11,
      color: mutedColor,
      font: normalFont,
    });
    y -= 18;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.88, 0.90, 0.94) });
    y -= 24;

    page.drawText('Student', { x: left, y, size: 11, color: mutedColor, font: normalFont });
    page.drawText('Parent / Guardian', { x: 320, y, size: 11, color: mutedColor, font: normalFont });
    y -= 18;
    page.drawText(input.studentName || 'Student', { x: left, y, size: 14, color: textColor, font: boldFont });
    page.drawText(input.parentName || '—', { x: 320, y, size: 14, color: textColor, font: boldFont });
    y -= 16;
    page.drawText(`Due Date: ${formatDate(input.dueDate)}`, { x: left, y, size: 11, color: mutedColor, font: normalFont });
    page.drawText(`Paid Date: ${formatDate(input.paidDate)}`, { x: 320, y, size: 11, color: mutedColor, font: normalFont });
    y -= 26;

    page.drawText('Description', { x: left, y, size: 11, color: mutedColor, font: normalFont });
    page.drawText('Amount', { x: 448, y, size: 11, color: mutedColor, font: normalFont });
    y -= 16;
    drawWrapped(input.description || 'Payment receipt', { font: boldFont, size: 12, color: textColor, lineHeight: 16 });
    page.drawText(formatCurrency(input.amount), {
      x: 448,
      y: y + 16,
      size: 13,
      color: rgb(primary.r, primary.g, primary.b),
      font: boldFont,
    });
    y -= 12;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.88, 0.90, 0.94) });
    y -= 20;

    drawWrapped(`Payment method: ${input.paymentMethod || '—'}`, { color: mutedColor });
    drawWrapped(`Reference: ${input.paymentReference || '—'}`, { color: mutedColor });
    y -= 4;
    drawWrapped(`Issued by: ${input.issuerName || 'School Administrator'}`, { color: mutedColor });

    return pdf.save();
  }

  private static async persistReceiptDocument(
    request: ReceiptGenerationRequest,
    input: {
      storagePath: string;
      filename: string;
      receiptNumber: string;
      studentName: string;
    },
  ): Promise<void> {
    const supabase = assertSupabase();
    const receiptRow = {
      document_type: 'receipt',
      filename: input.filename,
      storage_path: input.storagePath,
      title: `Receipt - ${input.studentName}`,
      user_id: request.issuer.id,
      preschool_id: request.schoolId,
      organization_id: request.schoolId,
      metadata: {
        student_id: request.student.id,
        fee_id: request.fee.id,
        payment_reference: request.fee.paymentReference,
        receipt_number: input.receiptNumber,
        document_subtype: 'receipt',
      },
    } as const;

    const { error: receiptInsertError } = await supabase
      .from('pdf_documents')
      .insert(receiptRow);

    if (receiptInsertError) {
      console.warn('[ReceiptService] pdf_documents insert failed, retrying as invoice:', receiptInsertError.message);
      await supabase.from('pdf_documents').insert({
        ...receiptRow,
        document_type: 'invoice',
      });
    }
  }

  static async generateFeeReceipt(request: ReceiptGenerationRequest): Promise<ReceiptGenerationResult> {
    const supabase = assertSupabase();
    const settings = await SchoolSettingsService.get(request.schoolId);
    const schoolName = settings.schoolName || 'School';
    const primaryColor = settings.primaryColor || '#1F5EFF';
    const accentColor = settings.secondaryColor || '#64748B';
    const logoUri = settings.schoolLogo;

    const receiptNumber = `REC-${new Date().getFullYear()}-${request.fee.id.slice(0, 6).toUpperCase()}`;
    const studentName = `${request.student.firstName} ${request.student.lastName}`.trim();
    const parentName = request.parent?.name || '—';
    const receiptFilename = `receipt-${sanitizeForFilename(schoolName)}-${timestampForFilename()}.pdf`;

    if (Platform.OS === 'web') {
      const pdfBytes = await this.createWebReceiptPdfBytes({
        schoolName,
        receiptNumber,
        studentName,
        parentName,
        amount: request.fee.amount,
        description: request.fee.description,
        dueDate: request.fee.dueDate,
        paidDate: request.fee.paidDate,
        paymentMethod: request.fee.paymentMethod,
        paymentReference: request.fee.paymentReference,
        issuerName: request.issuer.name,
        primaryColor,
      });

      const storagePath = `${request.schoolId}/${request.issuer.id}/${receiptFilename}`;
      const { error: uploadError } = await supabase.storage
        .from('generated-pdfs')
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Receipt upload failed');
      }

      const { data: signed } = await supabase.storage
        .from('generated-pdfs')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

      await this.persistReceiptDocument(request, {
        storagePath,
        filename: receiptFilename,
        receiptNumber,
        studentName,
      });

      return {
        storagePath,
        receiptUrl: signed?.signedUrl ?? null,
        filename: receiptFilename,
      };
    }

    const headerHtmlSafe = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid #E5E7EB;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${
            logoUri
              ? `<img src="${logoUri}" alt="${escapeHtml(schoolName)} logo" style="height:48px; width:auto; border-radius:10px;" />`
              : `<div style="width:48px; height:48px; border-radius:12px; background:${primaryColor}20; display:flex; align-items:center; justify-content:center; color:${primaryColor}; font-weight:700; font-size:18px;">
                   ${escapeHtml(schoolName.slice(0, 1).toUpperCase())}
                 </div>`
          }
          <div>
            <div style="font-size:18px; font-weight:700; color:#0F172A;">${escapeHtml(schoolName)}</div>
            <div style="font-size:12px; color:#64748B;">Payment Receipt</div>
          </div>
        </div>
        <div style="text-align:right; font-size:12px; color:#64748B;">
          <div>Receipt #${escapeHtml(receiptNumber)}</div>
          <div>${escapeHtml(formatDate(request.fee.paidDate))}</div>
        </div>
      </div>
    `;

    const footerHtmlSafe = `
      <div style="font-size:11px; color:#94A3B8; text-align:center;">
        Generated by EduDash Pro • ${escapeHtml(schoolName)}
      </div>
    `;

    const receiptHtml = `
      <div style="margin-top:18px;">
        <div style="display:flex; justify-content:space-between; gap:24px; margin-bottom:18px;">
          <div style="flex:1; background:#F8FAFC; padding:12px; border-radius:12px; border:1px solid #E2E8F0;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#64748B; margin-bottom:6px;">Student</div>
            <div style="font-size:15px; font-weight:600; color:#0F172A;">${escapeHtml(studentName)}</div>
            <div style="font-size:12px; color:#64748B;">Class: ${escapeHtml(request.student.className || '—')}</div>
          </div>
          <div style="flex:1; background:#F8FAFC; padding:12px; border-radius:12px; border:1px solid #E2E8F0;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#64748B; margin-bottom:6px;">Parent / Guardian</div>
            <div style="font-size:15px; font-weight:600; color:#0F172A;">${escapeHtml(parentName)}</div>
            <div style="font-size:12px; color:#64748B;">${escapeHtml(request.parent?.email || '—')}</div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:${primaryColor}15;">
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Description</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Due Date</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Paid Date</th>
              <th style="text-align:right; padding:10px; border-bottom:1px solid #E2E8F0;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(request.fee.description)}</td>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(formatDate(request.fee.dueDate))}</td>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(formatDate(request.fee.paidDate))}</td>
              <td style="padding:10px; text-align:right; border-bottom:1px solid #E2E8F0; font-weight:600;">${escapeHtml(formatCurrency(request.fee.amount))}</td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; margin-top:18px;">
          <div style="font-size:12px; color:#64748B;">
            <div>Payment method: ${escapeHtml(request.fee.paymentMethod)}</div>
            <div>Reference: ${escapeHtml(request.fee.paymentReference)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#64748B; margin-bottom:4px;">Total Paid</div>
            <div style="font-size:20px; font-weight:700; color:${primaryColor};">${escapeHtml(formatCurrency(request.fee.amount))}</div>
          </div>
        </div>

        <div style="margin-top:20px; font-size:12px; color:#64748B;">
          Issued by: ${escapeHtml(request.issuer.name)}
        </div>
      </div>
    `;

    const generator = DashPDFGenerator.getInstance();
    const result = await generator.generateFromStructuredData({
      type: 'invoice',
      title: `${schoolName} Receipt`,
      sections: [
        {
          id: 'receipt-details',
          title: 'Receipt Details',
          markdown: receiptHtml.replace(/\n/g, ''),
        },
      ],
      preferencesOverride: {
        theme: 'professional',
        branding: {
          logoUri,
          primaryColor,
          secondaryColor: accentColor,
          headerHtmlSafe,
          footerHtmlSafe,
        },
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Receipt generation failed');
    }

    if (!result.storagePath) {
      return {
        storagePath: undefined,
        receiptUrl: null,
        filename: result.filename,
      };
    }

    const { data: signed } = await supabase.storage
      .from('generated-pdfs')
      .createSignedUrl(result.storagePath, 60 * 60 * 24 * 365);

    if (result.storagePath) {
      await this.persistReceiptDocument(request, {
        storagePath: result.storagePath,
        filename: result.filename || receiptFilename,
        receiptNumber,
        studentName,
      });
    }

    return {
      storagePath: result.storagePath,
      receiptUrl: signed?.signedUrl ?? null,
      filename: result.filename,
    };
  }
}
