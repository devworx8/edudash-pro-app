/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Educational PDF Generation Service
 *
 * Generates printable worksheets, activities, and educational resources
 * for children and teachers using the existing expo-print infrastructure.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import type { Assignment } from '@/lib/models/Assignment';
import type {
  ActivitySheetData,
  CalloutOptions,
  ChartData,
  EnhancedPDFOptions,
  MathWorksheetData,
  ReadingWorksheetData,
  RubricCriterion,
  TableData,
  TextPDFOptions,
  TimelineStep,
  WorksheetOptions,
} from './educationalPdf.types';
import { createAnswerKeyHTML, createAssignmentWorksheetHTML, createActivitySheetHTML, createMathWorksheetHTML, createReadingWorksheetHTML } from './educationalPdfWorksheetTemplates';
import { buildTextPDFHtml, normalizeHtmlDocument } from './educationalPdfDocumentTemplates';
import {
  createCalloutBox as buildCalloutBox,
  createChartHTML as buildChartHTML,
  createProgressBar as buildProgressBar,
  createRubricTable as buildRubricTable,
  createTableHTML as buildTableHTML,
  createTimelineHTML as buildTimelineHTML,
  getEnhancedBaseStyles as buildEnhancedBaseStyles,
} from './educationalPdfEnhancedTemplates';

export type {
  ActivitySheetData,
  CalloutOptions,
  ChartData,
  EnhancedPDFOptions,
  GeneratePDFOptions,
  MathWorksheetData,
  PDFComponent,
  ReadingWorksheetData,
  RubricCriterion,
  TableData,
  TextPDFOptions,
  TextPDFOrientation,
  TextPDFPaperSize,
  TimelineStep,
  WorksheetOptions,
  WorksheetType,
} from './educationalPdf.types';

type LessonPlanArgs = {
  title: string;
  subject: string;
  grade: string;
  duration: string;
  objectives: string[];
  activities: Array<{ name: string; duration: string; description: string; materials: string[] }>;
  resources: string[];
  assessments: string[];
  differentiation: string;
  extensions: string[];
};

type MathWorksheetPDFArgs = {
  title: string;
  ageGroup: string;
  difficulty: string;
  problems: Array<{ question: string; answer: number; operation?: string }>;
  includeAnswerKey?: boolean;
};

type GenericWorksheetPDFArgs = {
  title: string;
  type: string;
  ageGroup: string;
  contentSections?: Array<{ title: string; content: string }>;
};

const slugifyTitle = (value: string, pattern: RegExp = /\s+/g): string =>
  (value || '')
    .toLowerCase()
    .replace(pattern, '-')
    .replace(/^-+|-+$/g, '');

class EducationalPDFServiceImpl {
  generateLessonPDF(_lessonConfig: {
    subject: any;
    grade: any;
    duration: any;
    objectives: any;
    activities: any;
    resources: any;
    assessments: any;
    differentiation: any;
    extensions: any;
  }) {
    throw new Error('Method not implemented.');
  }

  /**
   * Generate Lesson Plan PDF (wrapper for screens)
   */
  public async generateLessonPlanPDF(args: LessonPlanArgs): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${args.title}</title>
      <style>body{font-family:Arial,sans-serif;padding:16px;color:#333} h1{color:#1565c0} h2{color:#1565c0} ul{margin-left:18px}</style>
      </head><body>
      <h1>${args.title}</h1>
      <p><strong>Subject:</strong> ${args.subject} • <strong>Grade:</strong> ${args.grade} • <strong>Duration:</strong> ${args.duration}</p>
      <h2>Objectives</h2><ul>${args.objectives.map(o => `<li>${o}</li>`).join('')}</ul>
      <h2>Activities</h2>${args.activities.map(a => `<div><strong>${a.name}</strong> (${a.duration})<br/>${a.description}${a.materials?.length ? `<br/><em>Materials:</em> ${a.materials.join(', ')}` : ''}</div>`).join('<hr/>')}
      <h2>Resources</h2><ul>${args.resources.map(r => `<li>${r}</li>`).join('')}</ul>
      <h2>Assessments</h2><ul>${args.assessments.map(a => `<li>${a}</li>`).join('')}</ul>
      <h2>Differentiation</h2><p>${args.differentiation}</p>
      ${args.extensions?.length ? `<h2>Extensions</h2><ul>${args.extensions.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      </body></html>`;
      const uri = await this.createPDFFile(html, `${slugifyTitle(args.title, /[^a-z0-9]+/g)}.pdf`);
      return { success: true, filePath: uri };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to generate lesson PDF' };
    }
  }

  /**
   * Generate Math Worksheet PDF (wrapper)
   */
  public async generateMathWorksheetPDF(args: MathWorksheetPDFArgs): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const problemsHtml = args.problems.map((p, i) => `<div style="padding:8px 0;border-bottom:1px solid #eee;">${i + 1}. ${p.question} = _______</div>`).join('');
      const answersHtml = args.includeAnswerKey
        ? `<h3>Answer Key</h3>${args.problems.map((p, i) => `<div>${i + 1}. ${p.answer}</div>`).join('')}`
        : '';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${args.title}</title>
      <style>body{font-family:Arial,sans-serif;padding:16px;color:#333} h1{color:#1565c0}</style></head><body>
      <h1>${args.title}</h1>
      <p><strong>Age Group:</strong> ${args.ageGroup} • <strong>Difficulty:</strong> ${args.difficulty}</p>
      ${problemsHtml}
      ${answersHtml}
      </body></html>`;
      const uri = await this.createPDFFile(html, `${slugifyTitle(args.title, /[^a-z0-9]+/g)}.pdf`);
      return { success: true, filePath: uri };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to generate worksheet PDF' };
    }
  }

  /**
   * Generate Generic Worksheet PDF (wrapper)
   */
  public async generateWorksheetPDF(args: GenericWorksheetPDFArgs): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const sections = (args.contentSections || []).map(s => `<h3>${s.title}</h3><p>${s.content}</p>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${args.title}</title>
      <style>body{font-family:Arial,sans-serif;padding:16px;color:#333} h1{color:#1565c0}</style></head><body>
      <h1>${args.title}</h1>
      <p><strong>Type:</strong> ${args.type} • <strong>Age Group:</strong> ${args.ageGroup}</p>
      ${sections}
      </body></html>`;
      const uri = await this.createPDFFile(html, `${slugifyTitle(args.title, /[^a-z0-9]+/g)}.pdf`);
      return { success: true, filePath: uri };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to generate worksheet PDF' };
    }
  }

  /**
   * Generate a worksheet PDF from assignment data
   */
  async generateWorksheetFromAssignment(assignment: Assignment, options: WorksheetOptions): Promise<void> {
    try {
      const htmlContent = createAssignmentWorksheetHTML(assignment, options);
      await this.generateAndSharePDF(htmlContent, `worksheet-${slugifyTitle(assignment.title)}`);
    } catch (error) {
      console.error('Assignment worksheet generation failed:', error);
      Alert.alert('Error', 'Failed to generate worksheet PDF');
    }
  }

  /**
   * Generate math practice worksheet
   */
  async generateMathWorksheet(data: MathWorksheetData, options: WorksheetOptions): Promise<void> {
    try {
      const htmlContent = createMathWorksheetHTML(data, options);
      await this.generateAndSharePDF(htmlContent, `math-worksheet-${data.type}-${Date.now()}`);
    } catch (error) {
      console.error('Math worksheet generation failed:', error);
      Alert.alert('Error', 'Failed to generate math worksheet PDF');
    }
  }

  /**
   * Generate reading comprehension worksheet
   */
  async generateReadingWorksheet(data: ReadingWorksheetData, options: WorksheetOptions): Promise<void> {
    try {
      const htmlContent = createReadingWorksheetHTML(data, options);
      await this.generateAndSharePDF(htmlContent, `reading-worksheet-${data.type}-${Date.now()}`);
    } catch (error) {
      console.error('Reading worksheet generation failed:', error);
      Alert.alert('Error', 'Failed to generate reading worksheet PDF');
    }
  }

  /**
   * Generate activity sheet for children
   */
  async generateActivitySheet(data: ActivitySheetData, options: WorksheetOptions): Promise<void> {
    try {
      const htmlContent = createActivitySheetHTML(data, options);
      await this.generateAndSharePDF(htmlContent, `activity-sheet-${data.type}-${Date.now()}`);
    } catch (error) {
      console.error('Activity sheet generation failed:', error);
      Alert.alert('Error', 'Failed to generate activity sheet PDF');
    }
  }

  /**
   * Generate answer key for any worksheet
   */
  async generateAnswerKey(worksheetData: MathWorksheetData | ReadingWorksheetData, options: WorksheetOptions): Promise<void> {
    try {
      const htmlContent = createAnswerKeyHTML(worksheetData, options);
      await this.generateAndSharePDF(htmlContent, `answer-key-${Date.now()}`);
    } catch (error) {
      console.error('Answer key generation failed:', error);
      Alert.alert('Error', 'Failed to generate answer key PDF');
    }
  }

  /**
   * Generate an ad-hoc text-based PDF (simple export)
   */
  public async generateTextPDF(title: string, body: string, opts?: TextPDFOptions): Promise<void> {
    const html = buildTextPDFHtml(title, body, opts);
    await this.generateAndSharePDF(html, slugifyTitle(title || 'dash-export'));
  }

  /**
   * Generate PDF from complete HTML (for educational guides, etc.)
   * Use this when you have fully formatted HTML content
   */
  public async generateHTMLPDF(title: string, htmlContent: string, _opts?: TextPDFOptions): Promise<void> {
    const html = normalizeHtmlDocument(title, htmlContent);
    await this.generateAndSharePDF(html, slugifyTitle(title || 'educational-guide', /[^a-z0-9]+/g));
  }

  /**
   * Generate a text PDF and return a downloadable URI (web: data URI; native: file URI)
   * NOTE: This method does NOT open a share sheet; it only returns the URI
   */
  public async generateTextPDFUri(title: string, body: string, opts?: TextPDFOptions): Promise<{ uri: string; filename: string }> {
    const html = buildTextPDFHtml(title, body, opts);
    const filename = slugifyTitle(title || 'dash-export');
    const fullFilename = `${filename}.pdf`;
    const uri = await this.createPDFFile(html, fullFilename);
    return { uri, filename: fullFilename };
  }

  /**
   * Generate an HTML PDF and return a downloadable URI (web: data URI; native: file URI)
   * NOTE: This method does NOT open a share sheet; it only returns the URI
   */
  public async generateHTMLPDFUri(title: string, htmlContent: string): Promise<{ uri: string; filename: string }> {
    const html = normalizeHtmlDocument(title, htmlContent);
    const filename = slugifyTitle(title || 'educational-guide', /[^a-z0-9]+/g);
    const fullFilename = `${filename}.pdf`;
    const uri = await this.createPDFFile(html, fullFilename);
    return { uri, filename: fullFilename };
  }

  /**
   * Create a PDF file from HTML and return its URI without sharing (web: data URI; native: file URI)
   * For mobile, this now saves to a more accessible location
   */
  private async createPDFFile(html: string, filename?: string): Promise<string> {
    if (Platform.OS === 'web') {
      const result: any = await Print.printToFileAsync({ html, base64: true });
      return `data:application/pdf;base64,${result.base64}`;
    }

    const { uri: tempUri } = await Print.printToFileAsync({ html, base64: false });

    if (filename) {
      try {
        const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
        const documentDirectory = (FileSystem as any).documentDirectory || '';
        const finalUri = `${documentDirectory}${finalFilename}`;
        await FileSystem.copyAsync({
          from: tempUri,
          to: finalUri,
        });
        console.log('[EducationalPDFService] PDF saved to:', finalUri);
        return finalUri;
      } catch (error) {
        console.error('[EducationalPDFService] Failed to move PDF to document directory:', error);
        return tempUri;
      }
    }

    return tempUri;
  }

  /**
   * Generate PDF from HTML and share it
   */
  private async generateAndSharePDF(html: string, filename: string): Promise<string> {
    try {
      if (Platform.OS === 'web') {
        const result: any = await Print.printToFileAsync({
          html,
          base64: true,
        });
        const dataUri = `data:application/pdf;base64,${result.base64}`;
        try {
          const link = document.createElement('a');
          link.href = dataUri;
          link.download = `${filename}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          console.warn('Web download trigger failed; returning data URI only.', e);
        }
        return dataUri;
      }

      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share ${filename}.pdf`,
        });
      } else {
        Alert.alert('Success', `Worksheet saved as ${filename}.pdf`);
      }
      return uri;
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw error;
    }
  }

  private getEnhancedBaseStyles(options: EnhancedPDFOptions): string {
    return buildEnhancedBaseStyles(options);
  }

  public createChartHTML(
    type: 'bar' | 'line',
    data: ChartData,
    options?: { title?: string; width?: number; height?: number }
  ): string {
    return buildChartHTML(type, data, options);
  }

  public createTableHTML(data: TableData, options?: { zebra?: boolean; compact?: boolean; title?: string }): string {
    return buildTableHTML(data, options);
  }

  public createCalloutBox(options: CalloutOptions): string {
    return buildCalloutBox(options);
  }

  public createTimelineHTML(steps: TimelineStep[]): string {
    return buildTimelineHTML(steps);
  }

  public createRubricTable(criteria: RubricCriterion[]): string {
    return buildRubricTable(criteria);
  }

  public createProgressBar(percent: number, label?: string): string {
    return buildProgressBar(percent, label);
  }
}

export const EducationalPDFService = new EducationalPDFServiceImpl();
