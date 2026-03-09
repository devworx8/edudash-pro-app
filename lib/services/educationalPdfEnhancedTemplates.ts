import { DEFAULT_BRANDING } from '@/lib/config/pdfConfig';
import type {
  CalloutOptions,
  ChartData,
  EnhancedPDFOptions,
  RubricCriterion,
  TableData,
  TimelineStep,
} from './educationalPdf.types';

export function getEnhancedBaseStyles(options: EnhancedPDFOptions): string {
  const theme = options.theme || 'professional';
  const branding = options.branding || DEFAULT_BRANDING;

  return `
    ${getThemeCSS(theme)}
    @page {
      size: ${options.paperSize || 'A4'} ${options.orientation || 'portrait'};
      margin: 2cm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--body-font);
      color: var(--text-color);
      line-height: 1.6;
      background: var(--bg-color);
      counter-reset: page;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: var(--heading-font);
      color: var(--primary-color);
      page-break-after: avoid;
    }
    h1 { font-size: 32px; margin-bottom: 16px; }
    h2 { font-size: 26px; margin-top: 24px; margin-bottom: 12px; }
    h3 { font-size: 22px; margin-top: 20px; margin-bottom: 10px; }
    h4 { font-size: 18px; margin-top: 16px; margin-bottom: 8px; }
    p { margin-bottom: 12px; }
    ul, ol {
      margin: 12px 0 12px 24px;
    }
    li {
      margin-bottom: 6px;
    }
    .page-break { page-break-after: always; }
    .page-break-before { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
    .document-header {
      text-align: center;
      border-bottom: 3px solid var(--primary-color);
      padding-bottom: 20px;
      margin-bottom: 30px;
      page-break-after: avoid;
    }
    .document-header h1 {
      margin: 0;
      font-size: 36px;
    }
    .document-header .subtitle {
      font-size: 18px;
      color: var(--secondary-color);
      margin-top: 8px;
    }
    .document-footer {
      text-align: center;
      border-top: 1px solid var(--border-color);
      padding-top: 16px;
      margin-top: 40px;
      font-size: 12px;
      color: #666;
    }
    ${
      options.enablePageNumbers
        ? `
    .document-footer::after {
      counter-increment: page;
      content: "Page " counter(page);
      display: block;
      margin-top: 8px;
    }
    `
        : ''
    }
    ${
      options.enableWatermark && branding.watermarkText
        ? `
    body::before {
      content: "${branding.watermarkText}";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px;
      color: rgba(0, 0, 0, 0.05);
      z-index: -1;
      white-space: nowrap;
      pointer-events: none;
    }
    `
        : ''
    }
    .branding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .branding-logo {
      max-width: 120px;
      max-height: 60px;
    }
    .branding-name {
      font-size: 20px;
      font-weight: bold;
      color: var(--primary-color);
    }
  `;
}

export function createChartHTML(
  type: 'bar' | 'line',
  data: ChartData,
  options?: { title?: string; width?: number; height?: number }
): string {
  const width = options?.width || 600;
  const height = options?.height || 300;
  const maxValue = Math.max(...data.values);
  const colors = data.colors || ['#1565c0', '#42a5f5', '#90caf9', '#bbdefb'];

  if (type === 'bar') {
    return `
      <div class="chart-container no-break" style="margin: 20px 0;">
        ${options?.title ? `<h4 style="text-align: center; margin-bottom: 16px;">${options.title}</h4>` : ''}
        <div class="bar-chart" style="display: flex; align-items: flex-end; justify-content: space-around; height: ${height}px; border-bottom: 2px solid #333; padding: 10px;">
          ${data.labels
            .map((label, i) => {
              const barHeight = (data.values[i] / maxValue) * (height - 40);
              const color = colors[i % colors.length];
              return `
              <div class="bar-item" style="text-align: center; flex: 1; margin: 0 4px;">
                <div style="background: ${color}; height: ${barHeight}px; border-radius: 4px 4px 0 0; margin-bottom: 4px;"></div>
                <div style="font-size: 12px; font-weight: bold;">${data.values[i]}</div>
                <div style="font-size: 11px; margin-top: 4px;">${label}</div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  const points = data.values
    .map((val, i) => {
      const x = (i / (data.values.length - 1)) * (width - 40) + 20;
      const y = height - 40 - (val / maxValue) * (height - 60);
      return `${x},${y}`;
    })
    .join(' ');

  return `
    <div class="chart-container no-break" style="margin: 20px 0;">
      ${options?.title ? `<h4 style="text-align: center; margin-bottom: 16px;">${options.title}</h4>` : ''}
      <svg width="${width}" height="${height}" style="border: 1px solid #ddd; border-radius: 8px;">
        <polyline points="${points}" fill="none" stroke="#1565c0" stroke-width="2" />
        ${data.values
          .map((val, i) => {
            const x = (i / (data.values.length - 1)) * (width - 40) + 20;
            const y = height - 40 - (val / maxValue) * (height - 60);
            return `<circle cx="${x}" cy="${y}" r="4" fill="#1565c0" />`;
          })
          .join('')}
        ${data.labels
          .map((label, i) => {
            const x = (i / (data.values.length - 1)) * (width - 40) + 20;
            return `<text x="${x}" y="${height - 10}" text-anchor="middle" font-size="11">${label}</text>`;
          })
          .join('')}
      </svg>
    </div>
  `;
}

export function createTableHTML(data: TableData, options?: { zebra?: boolean; compact?: boolean; title?: string }): string {
  const zebra = options?.zebra !== false;
  const compact = options?.compact || false;

  return `
    <div class="table-container no-break" style="margin: 20px 0;">
      ${options?.title ? `<h4 style="margin-bottom: 12px;">${options.title}</h4>` : ''}
      <table style="width: 100%; border-collapse: collapse; border: 1px solid var(--border-color);">
        <thead>
          <tr style="background: var(--primary-color); color: white;">
            ${data.headers.map(h => `<th style="padding: ${compact ? '8px' : '12px'}; text-align: left; font-weight: bold;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.rows
            .map(
              (row, i) => `
            <tr style="${zebra && i % 2 === 1 ? 'background: var(--section-bg);' : ''}">
              ${row.map(cell => `<td style="padding: ${compact ? '6px 8px' : '10px 12px'}; border-bottom: 1px solid var(--border-color);">${cell}</td>`).join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function createCalloutBox(options: CalloutOptions): string {
  const iconMap = {
    info: 'ℹ️',
    tip: '💡',
    warning: '⚠️',
    objective: '🎯',
  };

  const colorMap = {
    info: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
    tip: { bg: '#fff3e0', border: '#f57c00', text: '#e65100' },
    warning: { bg: '#fff3e0', border: '#f57c00', text: '#e65100' },
    objective: { bg: '#e8f5e9', border: '#388e3c', text: '#1b5e20' },
  };

  const icon = options.icon || iconMap[options.kind];
  const color = colorMap[options.kind];

  return `
    <div class="callout-box no-break" style="
      background: ${color.bg};
      border-left: 4px solid ${color.border};
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    ">
      <div style="display: flex; align-items: flex-start;">
        <span style="font-size: 24px; margin-right: 12px;">${icon}</span>
        <div style="flex: 1;">
          ${options.title ? `<h4 style="margin: 0 0 8px 0; color: ${color.text};">${options.title}</h4>` : ''}
          <p style="margin: 0; color: ${color.text};">${options.content}</p>
        </div>
      </div>
    </div>
  `;
}

export function createTimelineHTML(steps: TimelineStep[]): string {
  return `
    <div class="timeline-container" style="margin: 20px 0;">
      ${steps
        .map(
          (step, i) => `
        <div class="timeline-item no-break" style="
          display: flex;
          margin-bottom: 20px;
          padding-bottom: ${i < steps.length - 1 ? '20px' : '0'};
          ${i < steps.length - 1 ? 'border-left: 2px solid var(--border-color);' : ''}
          margin-left: 20px;
        ">
          <div style="
            width: 40px;
            height: 40px;
            background: var(--primary-color);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            flex-shrink: 0;
            margin-left: -21px;
            margin-right: 16px;
          ">${i + 1}</div>
          <div style="flex: 1;">
            <h4 style="margin: 0 0 8px 0; color: var(--primary-color);">${step.title}</h4>
            <p style="margin: 0 0 4px 0; color: var(--text-color);">${step.description}</p>
            ${step.duration ? `<span style="font-size: 12px; color: #666;">⏱️ ${step.duration}</span>` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

export function createRubricTable(criteria: RubricCriterion[]): string {
  if (!criteria.length) {
    return '';
  }

  const levels = criteria[0].levels;
  return `
    <div class="rubric-container no-break" style="margin: 20px 0;">
      <h4 style="margin-bottom: 12px;">Assessment Rubric</h4>
      <table style="width: 100%; border-collapse: collapse; border: 2px solid var(--primary-color);">
        <thead>
          <tr style="background: var(--primary-color); color: white;">
            <th style="padding: 12px; text-align: left; font-weight: bold; width: 25%;">Criterion</th>
            ${levels
              .map(
                level => `
              <th style="padding: 12px; text-align: center; font-weight: bold;">
                ${level.label}<br>
                <span style="font-size: 12px; font-weight: normal;">(${level.points} pts)</span>
              </th>
            `
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${criteria
            .map(
              (criterion, i) => `
            <tr style="${i % 2 === 1 ? 'background: var(--section-bg);' : ''}">
              <td style="padding: 12px; font-weight: bold; border: 1px solid var(--border-color);">${criterion.name}</td>
              ${criterion.levels.map(level => `<td style="padding: 12px; border: 1px solid var(--border-color); font-size: 14px;">${level.description}</td>`).join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function createProgressBar(percent: number, label?: string): string {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  return `
    <div class="progress-container" style="margin: 16px 0;">
      ${label ? `<div style="margin-bottom: 8px; font-weight: bold; font-size: 14px;">${label}</div>` : ''}
      <div style="
        width: 100%;
        height: 24px;
        background: #e0e0e0;
        border-radius: 12px;
        overflow: hidden;
        position: relative;
      ">
        <div style="
          width: ${clampedPercent}%;
          height: 100%;
          background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
          transition: width 0.3s ease;
        "></div>
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${clampedPercent > 50 ? 'white' : 'var(--text-color)'};
          font-weight: bold;
          font-size: 12px;
        ">${clampedPercent}%</div>
      </div>
    </div>
  `;
}

function getThemeCSS(theme: 'professional' | 'colorful' | 'minimalist'): string {
  const themes = {
    professional: {
      primaryColor: '#1a237e',
      secondaryColor: '#3949ab',
      accentColor: '#5c6bc0',
      backgroundColor: '#ffffff',
      textColor: '#212121',
      borderColor: '#e0e0e0',
      headingFont: 'Georgia, serif',
      bodyFont: 'Arial, sans-serif',
      sectionBg: '#f5f5f5',
    },
    colorful: {
      primaryColor: '#1565c0',
      secondaryColor: '#42a5f5',
      accentColor: '#ff9800',
      backgroundColor: '#ffffff',
      textColor: '#333333',
      borderColor: '#90caf9',
      headingFont: 'Comic Sans MS, cursive',
      bodyFont: 'Arial, sans-serif',
      sectionBg: '#e3f2fd',
    },
    minimalist: {
      primaryColor: '#000000',
      secondaryColor: '#424242',
      accentColor: '#757575',
      backgroundColor: '#ffffff',
      textColor: '#212121',
      borderColor: '#bdbdbd',
      headingFont: 'Helvetica, Arial, sans-serif',
      bodyFont: 'Helvetica, Arial, sans-serif',
      sectionBg: '#fafafa',
    },
  };

  const t = themes[theme] || themes.professional;
  return `
    :root {
      --primary-color: ${t.primaryColor};
      --secondary-color: ${t.secondaryColor};
      --accent-color: ${t.accentColor};
      --bg-color: ${t.backgroundColor};
      --text-color: ${t.textColor};
      --border-color: ${t.borderColor};
      --heading-font: ${t.headingFont};
      --body-font: ${t.bodyFont};
      --section-bg: ${t.sectionBg};
    }
  `;
}
