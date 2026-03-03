import { DashPDFGenerator } from '@/services/DashPDFGenerator';
import { assertSupabase } from '@/lib/supabase';
import { SchoolSettingsService } from '@/lib/services/SchoolSettingsService';

export type FinanceDocumentType = 'invoice' | 'receipt';

interface FinanceDocumentParty {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

interface FinanceDocumentStudent {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  className?: string | null;
}

interface FinanceDocumentIssuer {
  id: string;
  name: string;
}

export interface FinanceDocumentRequest {
  organizationId: string;
  documentType: FinanceDocumentType;
  title: string;
  description: string;
  amount: number;
  paidDate: string;
  dueDate?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  categoryLabel?: string | null;
  recipientName?: string | null;
  sourceTag?: string | null;
  student?: FinanceDocumentStudent | null;
  parent?: FinanceDocumentParty | null;
  issuer: FinanceDocumentIssuer;
  sendToParent?: boolean;
}

export interface FinanceDocumentResult {
  storagePath?: string;
  documentUrl?: string | null;
  filename?: string;
  notificationError?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatCurrency = (amount: number): string => `R ${amount.toFixed(2)}`;

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const firstNonEmpty = (...values: Array<string | null | undefined>): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
};

async function sendDocumentNotification(
  request: FinanceDocumentRequest,
  resultUrl: string | null,
  documentNumber: string,
): Promise<void> {
  const parent = request.parent;
  if (!request.sendToParent) return;
  if (!parent?.id && !parent?.email) return;

  const supabase = assertSupabase();
  const studentName = firstNonEmpty(
    `${request.student?.firstName || ''} ${request.student?.lastName || ''}`,
    request.recipientName,
    'Learner',
  );

  const isInvoice = request.documentType === 'invoice';
  const title = isInvoice ? 'Invoice Ready' : 'Payment Receipt Ready';
  const body = isInvoice
    ? `Invoice created for ${studentName}.`
    : `Receipt issued for ${studentName}.`;
  const subject = isInvoice
    ? `Invoice for ${studentName}`
    : `Payment receipt for ${studentName}`;
  const text = resultUrl
    ? `${title}\n${documentNumber}\nAmount: ${formatCurrency(request.amount)}\nDownload: ${resultUrl}`
    : `${title}\n${documentNumber}\nAmount: ${formatCurrency(request.amount)}`;
  const html = `
    <p>${escapeHtml(title)}</p>
    <p>${escapeHtml(documentNumber)}</p>
    <p>Amount: <strong>${escapeHtml(formatCurrency(request.amount))}</strong></p>
    ${resultUrl ? `<p><a href="${resultUrl}">Open document</a></p>` : ''}
  `;

  await supabase.functions.invoke('notifications-dispatcher', {
    body: {
      event_type: isInvoice ? 'invoice_sent' : 'payment_receipt',
      user_ids: parent.id ? [parent.id] : undefined,
      recipient_email: parent.email || undefined,
      include_email: true,
      template_override: {
        title,
        body,
        data: {
          type: request.documentType,
          student_name: studentName,
          document_url: resultUrl,
          student_id: request.student?.id || null,
          payment_reference: request.paymentReference || null,
          source_tag: request.sourceTag || null,
        },
      },
      email_template_override: {
        subject,
        text,
        html,
      },
    },
  });
}

export class FinanceDocumentService {
  static async generateAndOptionallySend(
    request: FinanceDocumentRequest,
  ): Promise<FinanceDocumentResult> {
    if (!Number.isFinite(request.amount) || request.amount <= 0) {
      throw new Error('Enter a valid amount greater than zero.');
    }

    const supabase = assertSupabase();
    const settings = await SchoolSettingsService.get(request.organizationId);
    const schoolName = settings.schoolName || 'School';
    const primaryColor = settings.primaryColor || '#1F5EFF';
    const secondaryColor = settings.secondaryColor || '#64748B';
    const logoUri = settings.schoolLogo;

    const now = new Date();
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    const prefix = request.documentType === 'invoice' ? 'INV' : 'REC';
    const documentNumber = `${prefix}-${now.getFullYear()}-${token}`;

    const recipientName = firstNonEmpty(
      request.recipientName,
      `${request.student?.firstName || ''} ${request.student?.lastName || ''}`,
      request.parent?.name,
      'Recipient',
    );

    const docTitle = request.documentType === 'invoice' ? 'Invoice' : 'Payment Receipt';
    const categoryLabel = firstNonEmpty(request.categoryLabel, 'General');
    const dueDate = request.documentType === 'invoice'
      ? request.dueDate || request.paidDate
      : request.paidDate;

    const headerHtmlSafe = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid #E5E7EB;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${
            logoUri
              ? `<img src="${logoUri}" alt="${escapeHtml(schoolName)} logo" style="height:48px; width:auto; border-radius:10px;" />`
              : `<div style="width:48px; height:48px; border-radius:12px; background:${primaryColor}20; display:flex; align-items:center; justify-content:center; color:${primaryColor}; font-weight:700; font-size:18px;">${escapeHtml(schoolName.slice(0, 1).toUpperCase())}</div>`
          }
          <div>
            <div style="font-size:18px; font-weight:700; color:#0F172A;">${escapeHtml(schoolName)}</div>
            <div style="font-size:12px; color:#64748B;">${escapeHtml(docTitle)}</div>
          </div>
        </div>
        <div style="text-align:right; font-size:12px; color:#64748B;">
          <div>${escapeHtml(documentNumber)}</div>
          <div>${escapeHtml(formatDate(request.paidDate))}</div>
        </div>
      </div>
    `;

    const footerHtmlSafe = `
      <div style="font-size:11px; color:#94A3B8; text-align:center;">
        Generated by EduDash Pro • ${escapeHtml(schoolName)}
      </div>
    `;

    const detailsHtml = `
      <div style="margin-top:18px;">
        <div style="display:flex; justify-content:space-between; gap:20px; margin-bottom:18px;">
          <div style="flex:1; background:#F8FAFC; padding:12px; border-radius:12px; border:1px solid #E2E8F0;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#64748B; margin-bottom:6px;">Recipient</div>
            <div style="font-size:15px; font-weight:600; color:#0F172A;">${escapeHtml(recipientName)}</div>
            <div style="font-size:12px; color:#64748B;">Category: ${escapeHtml(categoryLabel)}</div>
          </div>
          <div style="flex:1; background:#F8FAFC; padding:12px; border-radius:12px; border:1px solid #E2E8F0;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#64748B; margin-bottom:6px;">Parent / Guardian</div>
            <div style="font-size:15px; font-weight:600; color:#0F172A;">${escapeHtml(firstNonEmpty(request.parent?.name, '—'))}</div>
            <div style="font-size:12px; color:#64748B;">${escapeHtml(firstNonEmpty(request.parent?.email, '—'))}</div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:${primaryColor}15;">
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Description</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Paid Date</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #E2E8F0;">Due Date</th>
              <th style="text-align:right; padding:10px; border-bottom:1px solid #E2E8F0;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(request.description)}</td>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(formatDate(request.paidDate))}</td>
              <td style="padding:10px; border-bottom:1px solid #E2E8F0;">${escapeHtml(formatDate(dueDate))}</td>
              <td style="padding:10px; text-align:right; border-bottom:1px solid #E2E8F0; font-weight:600;">${escapeHtml(formatCurrency(request.amount))}</td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; margin-top:18px; gap:16px;">
          <div style="font-size:12px; color:#64748B;">
            <div>Method: ${escapeHtml(firstNonEmpty(request.paymentMethod, 'manual'))}</div>
            <div>Reference: ${escapeHtml(firstNonEmpty(request.paymentReference, 'N/A'))}</div>
            <div>Source: ${escapeHtml(firstNonEmpty(request.sourceTag, 'finance_control_center'))}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#64748B; margin-bottom:4px;">
              ${request.documentType === 'invoice' ? 'Total Due' : 'Total Paid'}
            </div>
            <div style="font-size:20px; font-weight:700; color:${primaryColor};">${escapeHtml(formatCurrency(request.amount))}</div>
          </div>
        </div>

        <div style="margin-top:20px; font-size:12px; color:#64748B;">
          Issued by: ${escapeHtml(request.issuer.name)}
        </div>
      </div>
    `;

    const generator = DashPDFGenerator.getInstance();
    const generated = await generator.generateFromStructuredData({
      type: 'invoice',
      title: `${schoolName} ${docTitle}`,
      sections: [
        {
          id: 'finance-doc',
          title: docTitle,
          markdown: detailsHtml.replace(/\n/g, ''),
        },
      ],
      preferencesOverride: {
        theme: 'professional',
        branding: {
          logoUri,
          primaryColor,
          secondaryColor,
          headerHtmlSafe,
          footerHtmlSafe,
        },
      },
    });

    if (!generated.success) {
      throw new Error(generated.error || 'Failed to generate document.');
    }

    let documentUrl: string | null = null;
    if (generated.storagePath) {
      const { data: signed } = await supabase.storage
        .from('generated-pdfs')
        .createSignedUrl(generated.storagePath, 60 * 60 * 24 * 365);
      documentUrl = signed?.signedUrl || null;
    } else {
      documentUrl = (generated as any)?.uri || null;
    }

    if (generated.storagePath) {
      const docRow = {
        document_type: request.documentType,
        filename: generated.filename || `${docTitle.toLowerCase().replace(/\s+/g, '-')}-${token}.pdf`,
        storage_path: generated.storagePath,
        title: request.title,
        user_id: request.issuer.id,
        preschool_id: request.organizationId,
        organization_id: request.organizationId,
        metadata: {
          source_tag: request.sourceTag || null,
          document_number: documentNumber,
          document_subtype: request.documentType,
          category_label: categoryLabel,
          amount: request.amount,
          student_id: request.student?.id || null,
          parent_id: request.parent?.id || null,
          payment_reference: request.paymentReference || null,
          recipient_name: recipientName,
        },
      } as const;

      const { error: insertError } = await supabase.from('pdf_documents').insert(docRow);
      if (insertError) {
        await supabase.from('pdf_documents').insert({
          ...docRow,
          document_type: 'invoice',
        });
      }
    }

    let notificationError: string | null = null;
    try {
      await sendDocumentNotification(request, documentUrl, documentNumber);
    } catch (error: any) {
      notificationError = error?.message || 'Generated document, but failed to send to parent.';
    }

    return {
      storagePath: generated.storagePath,
      documentUrl,
      filename: generated.filename,
      notificationError,
    };
  }
}
