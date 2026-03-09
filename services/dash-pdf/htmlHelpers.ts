import type { DashPDFOptions, DocumentSpec, DocumentType } from './types';

export const detectDocumentType = (prompt: string): DocumentType => {
  const lower = prompt.toLowerCase();

  if (/letter|correspondence|memo/i.test(lower)) return 'letter';
  if (/report|summary|analysis/i.test(lower)) return 'report';
  if (/invoice|bill|receipt/i.test(lower)) return 'invoice';
  if (/study\s*guide|review/i.test(lower)) return 'study_guide';
  if (/lesson\s*plan|teaching/i.test(lower)) return 'lesson_plan';
  if (/progress\s*report|student\s*report/i.test(lower)) return 'progress_report';
  if (/test|assessment|quiz|exam/i.test(lower)) return 'assessment';
  if (/certificate|award|recognition/i.test(lower)) return 'certificate';
  if (/newsletter|announcement/i.test(lower)) return 'newsletter';
  if (/worksheet|practice|activity/i.test(lower)) return 'worksheet';

  return 'general';
};

export const extractTitle = (prompt: string): string | null => {
  const titleMatch = prompt.match(/(?:title|name|called?):?\s*["']?([^"'\n]+)["']?/i);
  if (titleMatch && titleMatch[1].trim().length > 0) {
    return titleMatch[1].trim().substring(0, 100);
  }

  const topicMatch = prompt.match(/(?:about|on|regarding|concerning)\s+([^,.\n]{5,80})/i);
  if (topicMatch && topicMatch[1].trim().length > 0) {
    return topicMatch[1].trim();
  }

  const createMatch = prompt.match(/(?:create|make|generate|write)\s+(?:a|an)\s+([^,.\n]{5,80})/i);
  if (createMatch && createMatch[1].trim().length > 0) {
    return createMatch[1].trim();
  }

  const firstLine = prompt.split('\n')[0].trim();
  if (firstLine.length > 0 && firstLine.length < 100) {
    return firstLine;
  }

  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length < 100) {
    return firstSentence;
  }

  return null;
};

export const isEducationalType = (docType: DocumentType): boolean =>
  ['study_guide', 'lesson_plan', 'progress_report', 'assessment', 'certificate', 'worksheet'].includes(docType);

export const getThemeColors = (theme: string): { primary: string; secondary: string; accent: string } => {
  switch (theme) {
    case 'colorful':
      return { primary: '#1976d2', secondary: '#388e3c', accent: '#fbc02d' };
    case 'minimalist':
      return { primary: '#424242', secondary: '#757575', accent: '#e0e0e0' };
    case 'professional':
    default:
      return { primary: '#1565c0', secondary: '#0d47a1', accent: '#42a5f5' };
  }
};

export const markdownToHtml = (markdown: string): string => {
  let html = markdown;

  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');

  if (!html.startsWith('<')) {
    html = `<p>${html}</p>`;
  }

  return html;
};

export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

export const buildGeneralHTML = (spec: DocumentSpec, options: DashPDFOptions): string => {
  const { theme, branding, enableWatermark } = options;
  const themeColors = getThemeColors(theme || 'professional');
  const fontFamily = branding?.fontFamily || 'Arial, sans-serif';

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(spec.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontFamily};
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      background: white;
    }
    h1 {
      color: ${themeColors.primary};
      font-size: 24pt;
      margin-bottom: 20px;
      border-bottom: 2px solid ${themeColors.accent};
      padding-bottom: 10px;
    }
    h2 {
      color: ${themeColors.primary};
      font-size: 18pt;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    h3 {
      color: ${themeColors.secondary};
      font-size: 14pt;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    p {
      margin-bottom: 12px;
      text-align: justify;
    }
    ul, ol {
      margin-left: 25px;
      margin-bottom: 12px;
    }
    li {
      margin-bottom: 6px;
    }
    img {
      max-width: 100%;
      height: auto;
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
    }
    th {
      background-color: ${themeColors.primary};
      color: white;
      font-weight: bold;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    ${
      enableWatermark
        ? `
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80pt;
      opacity: 0.05;
      pointer-events: none;
      z-index: -1;
    }
    `
        : ''
    }
    @media print {
      body { padding: 20px; }
      .page-break { page-break-after: always; }
      .no-break { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
`;

  if (enableWatermark && branding?.watermarkText) {
    html += `  <div class="watermark">${escapeHtml(branding.watermarkText)}</div>\n`;
  }

  if (branding?.headerHtmlSafe) {
    html += `  <div class="header">${branding.headerHtmlSafe}</div>\n`;
  }

  html += `  <h1>${escapeHtml(spec.title)}</h1>\n`;

  for (const section of spec.sections) {
    html += `  <div class="no-break">\n`;
    if (section.title && section.title !== 'Content') {
      html += `    <h2>${escapeHtml(section.title)}</h2>\n`;
    }
    html += `    ${markdownToHtml(section.markdown)}\n`;

    if (section.images && section.images.length > 0) {
      for (const img of section.images) {
        html += '    <figure>\n';
        html += `      <img src="${escapeHtml(img.uri)}" alt="${escapeHtml(img.alt || '')}" />\n`;
        if (img.caption) {
          html += `      <figcaption style="text-align: center; font-style: italic; margin-top: 5px;">${escapeHtml(img.caption)}</figcaption>\n`;
        }
        html += '    </figure>\n';
      }
    }

    html += '  </div>\n';
  }

  if (branding?.footerHtmlSafe) {
    html += `  <div class="footer">${branding.footerHtmlSafe}</div>\n`;
  } else {
    html += '  <div class="footer">Generated by Dash AI • EduDash Pro</div>\n';
  }

  html += '</body>\n</html>';

  return html;
};
