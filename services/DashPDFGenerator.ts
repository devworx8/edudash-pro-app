/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Dash PDF Generator Service
 * 
 * A comprehensive PDF generation module that can create high-quality PDF documents
 * from prompts, templates, or structured data. Includes knowledge base integration,
 * user preferences, custom templates, and advanced layout features.
 * 
 * @module DashPDFGenerator
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { assertSupabase } from '@/lib/supabase';
import { getCurrentSession, getCurrentProfile } from '@/lib/sessionManager';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService';
import { PDFTemplateService } from '@/lib/services/PDFTemplateService';
import { getPDFConfig, DEFAULT_BRANDING, type PDFBranding } from '@/lib/config/pdfConfig';

// Dynamically import SecureStore for cross-platform compatibility
let SecureStore: any = null;
try {
  if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
  }
} catch (e) {
  console.debug('SecureStore import failed (web or unsupported platform)', e);
}

// ====================================================================
// TYPE DEFINITIONS
// ====================================================================

/**
 * Supported document types for PDF generation
 */
export type DocumentType = 
  | 'report'
  | 'letter'
  | 'invoice'
  | 'study_guide'
  | 'lesson_plan'
  | 'progress_report'
  | 'assessment'
  | 'certificate'
  | 'newsletter'
  | 'worksheet'
  | 'general';

/**
 * Content section with rich formatting support
 */
export interface ContentSection {
  id: string;
  title: string;
  markdown: string;
  images?: Array<{
    uri: string;
    alt?: string;
    width?: number;
    height?: number;
    caption?: string;
  }>;
  charts?: Array<{
    type: 'bar' | 'line' | 'pie';
    data: { labels: string[]; values: number[]; colors?: string[] };
    title?: string;
  }>;
  tables?: Array<{
    headers: string[];
    rows: string[][];
    caption?: string;
  }>;
}

/**
 * Branding options for PDF customization
 */
export interface BrandingOptions {
  logoUri?: string;
  watermarkText?: string;
  headerHtmlSafe?: string;
  footerHtmlSafe?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
}

/**
 * PDF generation options
 */
export interface DashPDFOptions {
  theme?: 'professional' | 'colorful' | 'minimalist';
  paperSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  enablePageNumbers?: boolean;
  enableWatermark?: boolean;
  includeTableOfContents?: boolean;
  accessibilityEnabled?: boolean;
  branding?: BrandingOptions;
}

/**
 * Chart data for visualization
 */
export interface ChartData {
  type: 'bar' | 'line' | 'pie';
  data: {
    labels: string[];
    values: number[];
    colors?: string[];
  };
  title?: string;
}

/**
 * Table data for structured information
 */
export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

/**
 * PDF generation request
 */
export interface PDFGenerationRequest {
  type: DocumentType;
  title: string;
  prompt?: string;
  sections?: ContentSection[];
  data?: Record<string, any>;
  assets?: Array<{ uri: string; name: string; type: string }>;
  preferencesOverride?: Partial<DashPDFOptions>;
  templateId?: string;
  includeCharts?: boolean;
  includeTables?: boolean;
}

/**
 * PDF generation result
 */
export interface PDFGenerationResult {
  success: boolean;
  uri?: string;
  filename?: string;
  storagePath?: string;
  pageCount?: number;
  warnings?: string[];
  error?: string;
}

/**
 * User preferences for PDF generation
 */
export interface UserPDFPreferences {
  id?: string;
  userId: string;
  organizationId?: string;
  defaultTheme?: 'professional' | 'colorful' | 'minimalist';
  defaultFont?: string;
  defaultLayout?: Record<string, any>;
  defaultBranding?: BrandingOptions;
  headerHtmlSafe?: string;
  footerHtmlSafe?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Custom template definition
 */
export interface CustomTemplate {
  id?: string;
  ownerUserId: string;
  organizationId?: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  templateHtml: string;
  inputSchema?: Record<string, any>;
  thumbnailUrl?: string;
  isOrgShared?: boolean;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Document specification from AI parsing
 */
export interface DocumentSpec {
  docType: DocumentType;
  title: string;
  sections: ContentSection[];
  images: Array<{ uri: string; alt: string; caption?: string }>;
  charts?: ChartData[];
  tables?: TableData[];
  dataRequirements?: string[];
  tone?: string;
  audience?: string;
  brandingHints?: BrandingOptions;
  studentId?: string;
  classId?: string;
}

/**
 * Knowledge base search result
 */
export interface KnowledgeBaseItem {
  id: string;
  title: string;
  snippet?: string;
  content?: string;
  uri?: string;
  type: 'document' | 'image' | 'lesson' | 'student' | 'class' | 'assignment' | 'entity';
  confidence?: number;
  relevance?: number;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Progress callback phases
 */
export type ProgressPhase = 'parse' | 'retrieve' | 'compose' | 'render' | 'upload';

/**
 * Progress callback
 */
export type ProgressCallback = (phase: ProgressPhase, progress: number, message?: string) => void;

// ====================================================================
// DASH PDF GENERATOR CLASS
// ====================================================================

/**
 * Main PDF Generator Service
 */
class DashPDFGeneratorImpl {
  private userPreferences: UserPDFPreferences | null = null;
  private preferencesLoaded = false;

  /**
   * Generate PDF from a natural language prompt
   * 
   * @param prompt - User's natural language description of the PDF
   * @param options - Generation options
   * @param onProgress - Progress callback
   * @returns Promise with generation result
   */
  async generateFromPrompt(
    prompt: string,
    options?: Partial<DashPDFOptions>,
    onProgress?: ProgressCallback
  ): Promise<PDFGenerationResult> {
    try {
      onProgress?.('parse', 0, 'Analyzing your request...');

      // Parse prompt to structured specification
      const spec = await this.parsePromptToSpec(prompt, onProgress);
      
      onProgress?.('retrieve', 25, 'Gathering relevant information...');

      // Fetch related knowledge base items
      const kbItems = await this.searchKnowledgeBase(spec.dataRequirements || [], spec.docType);
      
      // Fetch required entities
      const entities = await this.fetchEntitiesForSpec(spec);
      
      onProgress?.('compose', 45, 'Creating document layout...');

      // Compose HTML from specification
      const html = await this.composeHTML(spec, entities, kbItems, options);
      
      onProgress?.('render', 70, 'Rendering PDF...');

      // Render to PDF file
      const result = await this.renderToPDFFile(html, spec.title, spec.docType, onProgress);
      
      onProgress?.('upload', 100, 'Complete!');

      return result;
    } catch (error) {
      console.error('[DashPDFGenerator] generateFromPrompt failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed'
      };
    }
  }

  /**
   * Generate PDF from a template
   * 
   * @param templateId - Template identifier
   * @param data - Data to populate template
   * @param options - Generation options
   * @param onProgress - Progress callback
   * @returns Promise with generation result
   */
  async generateFromTemplate(
    templateId: string,
    data: Record<string, any>,
    options?: Partial<DashPDFOptions>,
    onProgress?: ProgressCallback
  ): Promise<PDFGenerationResult> {
    try {
      onProgress?.('retrieve', 10, 'Loading template...');

      // Get template
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      onProgress?.('compose', 30, 'Filling template...');

      // Populate template with data
      const html = await this.populateTemplate(template, data, options);
      
      onProgress?.('render', 60, 'Rendering PDF...');

      // Render to PDF file
      const result = await this.renderToPDFFile(html, template.name, template.documentType, onProgress);
      
      onProgress?.('upload', 100, 'Complete!');

      return result;
    } catch (error) {
      console.error('[DashPDFGenerator] generateFromTemplate failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Template generation failed'
      };
    }
  }

  /**
   * Generate PDF from structured data
   * 
   * @param request - Complete generation request
   * @param onProgress - Progress callback
   * @returns Promise with generation result
   */
  async generateFromStructuredData(
    request: PDFGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<PDFGenerationResult> {
    try {
      onProgress?.('compose', 20, 'Processing structured data...');

      // Build specification from request
      const spec: DocumentSpec = {
        docType: request.type,
        title: request.title,
        sections: request.sections || [],
        images: [],
        charts: request.includeCharts ? [] : undefined,
        tables: request.includeTables ? [] : undefined,
      };

      onProgress?.('compose', 40, 'Creating document layout...');

      // Compose HTML
      const html = await this.composeHTML(spec, {}, [], request.preferencesOverride);
      
      onProgress?.('render', 70, 'Rendering PDF...');

      // Render to PDF file
      const result = await this.renderToPDFFile(html, spec.title, spec.docType, onProgress);
      
      onProgress?.('upload', 100, 'Complete!');

      return result;
    } catch (error) {
      console.error('[DashPDFGenerator] generateFromStructuredData failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed'
      };
    }
  }

  /**
   * Preview HTML without generating PDF
   * 
   * @param request - Generation request
   * @returns Promise with HTML string and warnings
   */
  async previewHTML(request: PDFGenerationRequest): Promise<{ html: string; warnings: string[] }> {
    try {
      const spec: DocumentSpec = {
        docType: request.type,
        title: request.title,
        sections: request.sections || [],
        images: [],
      };

      const html = await this.composeHTML(spec, {}, [], request.preferencesOverride);
      
      return {
        html,
        warnings: []
      };
    } catch (error) {
      console.error('[DashPDFGenerator] previewHTML failed:', error);
      throw error;
    }
  }

  /**
   * Batch generate multiple PDFs
   * 
   * @param requests - Array of generation requests
   * @param concurrency - Maximum concurrent generations
   * @param onProgress - Progress callback
   * @returns Promise with array of results
   */
  async batchGenerate(
    requests: PDFGenerationRequest[],
    concurrency: number = 3,
    onProgress?: (overallProgress: number, currentIndex: number, total: number) => void
  ): Promise<PDFGenerationResult[]> {
    const results: PDFGenerationResult[] = [];
    const total = requests.length;
    let completed = 0;

    // Process in batches
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, Math.min(i + concurrency, requests.length));
      
      const batchResults = await Promise.all(
        batch.map(async (request) => {
          const result = await this.generateFromStructuredData(request);
          completed++;
          onProgress?.(Math.round((completed / total) * 100), completed, total);
          return result;
        })
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  // ====================================================================
  // USER PREFERENCES
  // ====================================================================

  /**
   * Load user preferences from database and cache
   */
  async loadUserPreferences(): Promise<UserPDFPreferences | null> {
    try {
      if (this.preferencesLoaded && this.userPreferences) {
        return this.userPreferences;
      }

      const session = await getCurrentSession();
      if (!session?.user_id) {
        return null;
      }

      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('pdf_user_preferences')
        .select('*')
        .eq('user_id', session.user_id)
        .maybeSingle();

      if (error) {
        console.error('[DashPDFGenerator] Failed to load preferences:', error);
        return null;
      }

      this.userPreferences = data as UserPDFPreferences | null;
      this.preferencesLoaded = true;

      return this.userPreferences;
    } catch (error) {
      console.error('[DashPDFGenerator] loadUserPreferences error:', error);
      return null;
    }
  }

  /**
   * Save user preferences to database
   */
  async saveUserPreferences(preferences: Partial<UserPDFPreferences>): Promise<boolean> {
    try {
      const session = await getCurrentSession();
      if (!session?.user_id) {
        throw new Error('User not authenticated');
      }

      const profile = await getCurrentProfile();
      const organizationId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

      const supabase = assertSupabase();
      
      const prefsData = {
        user_id: session.user_id,
        organization_id: organizationId,
        default_theme: preferences.defaultTheme,
        default_font: preferences.defaultFont,
        default_layout: preferences.defaultLayout,
        default_branding: preferences.defaultBranding,
        header_html_safe: preferences.headerHtmlSafe,
        footer_html_safe: preferences.footerHtmlSafe,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('pdf_user_preferences')
        .upsert(prefsData, { onConflict: 'user_id' });

      if (error) {
        console.error('[DashPDFGenerator] Failed to save preferences:', error);
        return false;
      }

      // Update cache
      this.userPreferences = { ...this.userPreferences, ...preferences } as UserPDFPreferences;

      return true;
    } catch (error) {
      console.error('[DashPDFGenerator] saveUserPreferences error:', error);
      return false;
    }
  }

  // ====================================================================
  // CUSTOM TEMPLATES
  // ====================================================================

  /**
   * List custom templates
   */
  async listCustomTemplates(filters?: {
    documentType?: DocumentType;
    orgShared?: boolean;
    publicOnly?: boolean;
  }): Promise<CustomTemplate[]> {
    try {
      const session = await getCurrentSession();
      if (!session?.user_id) {
        return [];
      }

      const profile = await getCurrentProfile();
      const organizationId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

      const supabase = assertSupabase();
      let query = supabase.from('pdf_custom_templates').select('*');

      // Apply filters
      if (filters?.documentType) {
        query = query.eq('document_type', filters.documentType);
      }

      if (filters?.publicOnly) {
        query = query.eq('is_public', true);
      } else if (filters?.orgShared && organizationId) {
        query = query.eq('organization_id', organizationId).eq('is_org_shared', true);
      } else {
        // Show user's own templates + shared templates
        query = query.or(`owner_user_id.eq.${session.user_id},and(organization_id.eq.${organizationId},is_org_shared.eq.true)`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('[DashPDFGenerator] Failed to list templates:', error);
        return [];
      }

      return data as CustomTemplate[];
    } catch (error) {
      console.error('[DashPDFGenerator] listCustomTemplates error:', error);
      return [];
    }
  }

  /**
   * Get a specific template
   */
  async getTemplate(templateId: string): Promise<CustomTemplate | null> {
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('pdf_custom_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        console.error('[DashPDFGenerator] Failed to get template:', error);
        return null;
      }

      return data as CustomTemplate;
    } catch (error) {
      console.error('[DashPDFGenerator] getTemplate error:', error);
      return null;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(template: Omit<CustomTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomTemplate | null> {
    try {
      const session = await getCurrentSession();
      if (!session?.user_id) {
        throw new Error('User not authenticated');
      }

      const profile = await getCurrentProfile();
      const organizationId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('pdf_custom_templates')
        .insert({
          owner_user_id: session.user_id,
          organization_id: organizationId,
          name: template.name,
          description: template.description,
          document_type: template.documentType,
          template_html: template.templateHtml,
          input_schema: template.inputSchema,
          thumbnail_url: template.thumbnailUrl,
          is_org_shared: template.isOrgShared || false,
          is_public: template.isPublic || false,
        })
        .select()
        .single();

      if (error) {
        console.error('[DashPDFGenerator] Failed to create template:', error);
        return null;
      }

      return data as CustomTemplate;
    } catch (error) {
      console.error('[DashPDFGenerator] createTemplate error:', error);
      return null;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(templateId: string, updates: Partial<CustomTemplate>): Promise<boolean> {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('pdf_custom_templates')
        .update({
          name: updates.name,
          description: updates.description,
          template_html: updates.templateHtml,
          input_schema: updates.inputSchema,
          thumbnail_url: updates.thumbnailUrl,
          is_org_shared: updates.isOrgShared,
          is_public: updates.isPublic,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId);

      if (error) {
        console.error('[DashPDFGenerator] Failed to update template:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[DashPDFGenerator] updateTemplate error:', error);
      return false;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('pdf_custom_templates')
        .delete()
        .eq('id', templateId);

      if (error) {
        console.error('[DashPDFGenerator] Failed to delete template:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[DashPDFGenerator] deleteTemplate error:', error);
      return false;
    }
  }

  /**
   * Share template with organization
   */
  async shareTemplate(templateId: string, orgShared: boolean): Promise<boolean> {
    return this.updateTemplate(templateId, { isOrgShared: orgShared });
  }

  // ====================================================================
  // KNOWLEDGE BASE & RAG
  // ====================================================================

  /**
   * Search knowledge base for relevant content
   * ECD-focused: searches for student milestones, activities, progress reports
   */
  async searchKnowledgeBase(queries: string[], docType: DocumentType): Promise<KnowledgeBaseItem[]> {
    try {
      const supabase = assertSupabase();
      const session = await getCurrentSession();
      if (!session?.user_id) {
        console.warn('[DashPDFGenerator] No session for knowledge base search');
        return [];
      }

      const profile = await getCurrentProfile();
      const preschoolId = profile?.preschool_id;

      if (!preschoolId) {
        console.warn('[DashPDFGenerator] No preschool_id for knowledge base search');
        return [];
      }

      const results: KnowledgeBaseItem[] = [];

      // Search based on document type
      if (docType === 'progress_report' || docType === 'report') {
        // Fetch recent progress reports for reference
        const { data: reports } = await supabase
          .from('progress_reports')
          .select('id, student_id, teacher_comments, strengths, areas_for_improvement, created_at')
          .eq('preschool_id', preschoolId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (reports) {
          reports.forEach(report => {
            results.push({
              id: report.id,
              type: 'document',
              title: `Progress Report - ${new Date(report.created_at).toLocaleDateString()}`,
              content: `${report.teacher_comments}\n\nStrengths: ${report.strengths}\n\nAreas for improvement: ${report.areas_for_improvement}`,
              relevance: 0.8,
              source: 'progress_reports',
            });
          });
        }
      }

      if (docType === 'lesson_plan') {
        // Fetch recent lessons for reference
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id, title, description, learning_objectives, age_group')
          .eq('preschool_id', preschoolId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (lessons) {
          lessons.forEach(lesson => {
            results.push({
              id: lesson.id,
              type: 'document',
              title: lesson.title,
              content: `${lesson.description}\n\nObjectives: ${lesson.learning_objectives}\n\nAge Group: ${lesson.age_group}`,
              relevance: 0.9,
              source: 'lessons',
            });
          });
        }
      }

      // Fetch relevant students for any document type
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, date_of_birth, class_id')
        .eq('preschool_id', preschoolId)
        .eq('is_active', true)
        .limit(50);

      if (students) {
        students.forEach(student => {
          const age = student.date_of_birth 
            ? Math.floor((Date.now() - new Date(student.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null;
          results.push({
            id: student.id,
            type: 'entity',
            title: `${student.first_name} ${student.last_name}`,
            content: age ? `Age: ${age} years` : 'Student',
            relevance: 0.7,
            source: 'students',
          });
        });
      }

      console.log(`[DashPDFGenerator] Found ${results.length} knowledge base items for ${docType}`);
      return results;
    } catch (error) {
      console.error('[DashPDFGenerator] searchKnowledgeBase error:', error);
      return [];
    }
  }

  /**
   * Fetch entities required for document specification
   * ECD-focused: fetches student data, milestones, teacher info, class details
   */
  async fetchEntitiesForSpec(spec: DocumentSpec): Promise<Record<string, any>> {
    try {
      const supabase = assertSupabase();
      const session = await getCurrentSession();
      if (!session?.user_id) return {};

      const profile = await getCurrentProfile();
      const preschoolId = profile?.preschool_id;
      if (!preschoolId) return {};

      const entities: Record<string, any> = {
        preschool_id: preschoolId,
        generated_at: new Date().toISOString(),
        generated_by: session.user_id,
      };

      // Fetch school information
      const { data: preschool } = await supabase
        .from('preschools')
        .select('id, name, address, phone, email, logo_url')
        .eq('id', preschoolId)
        .single();

      if (preschool) {
        entities.school = preschool;
      }

      // Process data requirements from spec
      if (spec.dataRequirements) {
        for (const requirement of spec.dataRequirements) {
          if (requirement === 'student' && spec.studentId) {
            // Fetch student with parent info
            const { data: student } = await supabase
              .from('students')
              .select(`
                id, first_name, last_name, date_of_birth, class_id,
                parent_id, guardian_id,
                classes (name, grade_level),
                profiles!parent_id (first_name, last_name, email, phone)
              `)
              .eq('id', spec.studentId)
              .single();

            if (student) {
              entities.student = student;
              
              // Calculate age for ECD context
              if (student.date_of_birth) {
                const ageInMonths = Math.floor(
                  (Date.now() - new Date(student.date_of_birth).getTime()) / (30.44 * 24 * 60 * 60 * 1000)
                );
                entities.student.age_months = ageInMonths;
                entities.student.age_years = Math.floor(ageInMonths / 12);
              }
            }
          }

          if (requirement === 'class' && spec.classId) {
            const { data: classInfo } = await supabase
              .from('classes')
              .select('id, name, grade_level, age_group, teacher_id, profiles!teacher_id (first_name, last_name)')
              .eq('id', spec.classId)
              .single();

            if (classInfo) {
              entities.class = classInfo;
            }
          }

          if (requirement === 'teacher') {
            entities.teacher = profile;
          }

          if (requirement === 'milestones' && spec.studentId) {
            // Fetch developmental milestones for progress reports
            const { data: milestones } = await supabase
              .from('student_milestones')
              .select('milestone_name, achieved, achieved_at, notes')
              .eq('student_id', spec.studentId)
              .order('achieved_at', { ascending: false })
              .limit(20);

            if (milestones) {
              entities.milestones = milestones;
            }
          }
        }
      }

      console.log(`[DashPDFGenerator] Fetched ${Object.keys(entities).length} entities for spec`);
      return entities;
    } catch (error) {
      console.error('[DashPDFGenerator] fetchEntitiesForSpec error:', error);
      return {};
    }
  }

  // ====================================================================
  // PRIVATE METHODS
  // ====================================================================

  /**
   * Parse natural language prompt to document specification
   */
  private async parsePromptToSpec(prompt: string, onProgress?: ProgressCallback): Promise<DocumentSpec> {
    try {
      onProgress?.('parse', 5, 'Understanding your request...');

      // TODO: Call ai-gateway with action 'pdf_compose'
      // For now, use heuristic fallback
      
      const docType = this.detectDocumentType(prompt);
      const title = this.extractTitle(prompt) || 'Untitled Document';
      
      onProgress?.('parse', 15, 'Structuring content...');

      const sections: ContentSection[] = [{
        id: 'main',
        title: 'Content',
        markdown: prompt,
      }];

      onProgress?.('parse', 25, 'Ready to compose...');

      return {
        docType,
        title,
        sections,
        images: [],
        dataRequirements: [],
      };
    } catch (error) {
      console.error('[DashPDFGenerator] parsePromptToSpec failed:', error);
      throw error;
    }
  }

  /**
   * Detect document type from prompt
   */
  private detectDocumentType(prompt: string): DocumentType {
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
  }

  /**
   * Extract title from prompt using intelligent heuristics
   */
  private extractTitle(prompt: string): string | null {
    // Check for explicit title markers
    const titleMatch = prompt.match(/(?:title|name|called?):?\s*["']?([^"'\n]+)["']?/i);
    if (titleMatch && titleMatch[1].trim().length > 0) {
      return titleMatch[1].trim().substring(0, 100);
    }
    
    // Check for "about X" or "on X" patterns
    const topicMatch = prompt.match(/(?:about|on|regarding|concerning)\s+([^,.\n]{5,80})/i);
    if (topicMatch && topicMatch[1].trim().length > 0) {
      return topicMatch[1].trim();
    }
    
    // Check for "create a X for Y" patterns
    const createMatch = prompt.match(/(?:create|make|generate|write)\s+(?:a|an)\s+([^,.\n]{5,80})/i);
    if (createMatch && createMatch[1].trim().length > 0) {
      return createMatch[1].trim();
    }
    
    // Fallback: first line or first sentence
    const firstLine = prompt.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length < 100) {
      return firstLine;
    }
    
    const firstSentence = prompt.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return firstSentence;
    }
    
    return null;
  }

  /**
   * Compose HTML from document specification
   */
  private async composeHTML(
    spec: DocumentSpec,
    entities: Record<string, any>,
    kbItems: KnowledgeBaseItem[],
    optionsOverride?: Partial<DashPDFOptions>
  ): Promise<string> {
    try {
      // Load user preferences
      const prefs = await this.loadUserPreferences();
      const config = getPDFConfig();

      // Merge options: config defaults < user prefs < override
      const options: DashPDFOptions = {
        theme: optionsOverride?.theme || prefs?.defaultTheme || config.defaultTheme,
        paperSize: optionsOverride?.paperSize || (config.defaultPaperSize as 'A4' | 'Letter'),
        orientation: optionsOverride?.orientation || (config.defaultOrientation as 'portrait' | 'landscape'),
        enablePageNumbers: optionsOverride?.enablePageNumbers ?? config.enablePageNumbers,
        enableWatermark: optionsOverride?.enableWatermark ?? config.enableWatermark,
        includeTableOfContents: optionsOverride?.includeTableOfContents ?? false,
        accessibilityEnabled: optionsOverride?.accessibilityEnabled ?? true,
        branding: optionsOverride?.branding || prefs?.defaultBranding || DEFAULT_BRANDING,
      };

      // For educational document types, delegate to PDFTemplateService if possible
      if (this.isEducationalType(spec.docType)) {
        // TODO: Call PDFTemplateService.render() with appropriate data
        console.log('[DashPDFGenerator] Educational type - delegating to template service');
      }

      // Build HTML using helper methods
      const html = this.buildGeneralHTML(spec, options);

      return html;
    } catch (error) {
      console.error('[DashPDFGenerator] composeHTML failed:', error);
      throw error;
    }
  }

  /**
   * Check if document type is educational
   */
  private isEducationalType(docType: DocumentType): boolean {
    return [
      'study_guide',
      'lesson_plan',
      'progress_report',
      'assessment',
      'certificate',
      'worksheet'
    ].includes(docType);
  }

  /**
   * Build general HTML for non-educational types
   */
  private buildGeneralHTML(spec: DocumentSpec, options: DashPDFOptions): string {
    const { theme, branding, enablePageNumbers, enableWatermark } = options;

    const themeColors = this.getThemeColors(theme || 'professional');
    const fontFamily = branding?.fontFamily || 'Arial, sans-serif';

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(spec.title)}</title>
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
    
    ${enableWatermark ? `
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
    ` : ''}
    
    @media print {
      body { padding: 20px; }
      .page-break { page-break-after: always; }
      .no-break { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
`;

    // Watermark
    if (enableWatermark && branding?.watermarkText) {
      html += `  <div class="watermark">${this.escapeHtml(branding.watermarkText)}</div>\n`;
    }

    // Header
    if (branding?.headerHtmlSafe) {
      html += `  <div class="header">${branding.headerHtmlSafe}</div>\n`;
    }

    // Title
    html += `  <h1>${this.escapeHtml(spec.title)}</h1>\n`;

    // Content sections
    for (const section of spec.sections) {
      html += `  <div class="no-break">\n`;
      if (section.title && section.title !== 'Content') {
        html += `    <h2>${this.escapeHtml(section.title)}</h2>\n`;
      }
      html += `    ${this.markdownToHtml(section.markdown)}\n`;
      
      // Images
      if (section.images && section.images.length > 0) {
        for (const img of section.images) {
          html += `    <figure>\n`;
          html += `      <img src="${this.escapeHtml(img.uri)}" alt="${this.escapeHtml(img.alt || '')}" />\n`;
          if (img.caption) {
            html += `      <figcaption style="text-align: center; font-style: italic; margin-top: 5px;">${this.escapeHtml(img.caption)}</figcaption>\n`;
          }
          html += `    </figure>\n`;
        }
      }
      
      html += `  </div>\n`;
    }

    // Footer
    if (branding?.footerHtmlSafe) {
      html += `  <div class="footer">${branding.footerHtmlSafe}</div>\n`;
    } else {
      html += `  <div class="footer">Generated by Dash AI • EduDash Pro</div>\n`;
    }

    html += `</body>\n</html>`;

    return html;
  }

  /**
   * Get theme colors
   */
  private getThemeColors(theme: string): { primary: string; secondary: string; accent: string } {
    switch (theme) {
      case 'colorful':
        return { primary: '#1976d2', secondary: '#388e3c', accent: '#fbc02d' };
      case 'minimalist':
        return { primary: '#424242', secondary: '#757575', accent: '#e0e0e0' };
      case 'professional':
      default:
        return { primary: '#1565c0', secondary: '#0d47a1', accent: '#42a5f5' };
    }
  }

  /**
   * Simple markdown to HTML converter
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Line breaks and paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br/>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`;
    }

    return html;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Populate template with data
   * Enhanced with ECD-specific formatting (age display, milestone badges, emoji)
   */
  private async populateTemplate(
    template: CustomTemplate,
    data: Record<string, any>,
    options?: Partial<DashPDFOptions>
  ): Promise<string> {
    let html = template.templateHtml;

    // Enhanced variable replacement with formatting
    for (const [key, value] of Object.entries(data)) {
      let formattedValue = String(value);

      // ECD-specific formatting
      if (key === 'age_months' && typeof value === 'number') {
        const years = Math.floor(value / 12);
        const months = value % 12;
        formattedValue = months > 0 ? `${years}y ${months}m` : `${years} years`;
      }

      if (key === 'achievement_level') {
        const badges: Record<string, string> = {
          'not_yet': '⏳ Emerging',
          'developing': '🌱 Developing',
          'achieved': '⭐ Achieved',
          'exceeding': '🌟 Exceeding',
        };
        formattedValue = badges[value] || value;
      }

      if (key === 'date' && value instanceof Date) {
        formattedValue = value.toLocaleDateString('en-ZA', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }

      // Support nested object access: {{student.name}}
      const regex = new RegExp(`{{\\s*${key.replace('.', '\\.')}\\s*}}`, 'g');
      html = html.replace(regex, formattedValue);
    }

    // Handle conditional blocks: {{#if condition}}...{{/if}}
    html = html.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, condition, content) => {
      return data[condition] ? content : '';
    });

    // Handle loops: {{#each items}}...{{/each}}
    html = html.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (match, arrayKey, itemTemplate) => {
      const array = data[arrayKey];
      if (!Array.isArray(array)) return '';
      
      return array.map(item => {
        let itemHtml = itemTemplate;
        for (const [k, v] of Object.entries(item)) {
          itemHtml = itemHtml.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        }
        return itemHtml;
      }).join('');
    });

    return html;
  }

  /**
   * Render HTML to PDF file
   */
  private async renderToPDFFile(
    html: string,
    title: string,
    docType: DocumentType,
    onProgress?: ProgressCallback
  ): Promise<PDFGenerationResult> {
    try {
      onProgress?.('render', 75, 'Creating PDF...');

      // Generate PDF using expo-print.
      // On web, `printToFileAsync` can return only base64 (or undefined in some runtimes),
      // so avoid destructuring directly and build a safe URI fallback.
      const printResult = await Print.printToFileAsync({
        html,
        base64: Platform.OS === 'web',
      });
      const uri =
        printResult?.uri ||
        (Platform.OS === 'web' && printResult?.base64
          ? `data:application/pdf;base64,${printResult.base64}`
          : undefined);
      if (!uri) {
        throw new Error('PDF renderer did not return a document URI');
      }
      
      onProgress?.('render', 85, 'Finalizing...');

      // Generate meaningful filename from context
      const timestamp = `${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
      
      // Clean and sanitize title for filename
      const sanitizedTitle = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Remove consecutive hyphens
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .substring(0, 50); // Limit length
      
      // Add document type prefix for context
      const typePrefix = docType === 'general' ? '' : `${docType.replace('_', '-')}-`;
      
      // Generate filename: [type-]title_date.pdf
      const filename = `${typePrefix}${sanitizedTitle || 'document'}_${timestamp}.pdf`;

      // On native platforms, optionally upload to Supabase Storage
      if (Platform.OS !== 'web') {
        try {
          onProgress?.('upload', 90, 'Uploading to storage...');
          const storagePath = await Promise.race<string>([
            this.uploadToStorage(uri, filename),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Storage upload timeout')), 15000)
            ),
          ]);
          
          return {
            success: true,
            uri,
            filename,
            storagePath,
            pageCount: 1, // TODO: Calculate actual page count
            warnings: []
          };
        } catch (uploadError) {
          console.warn('[DashPDFGenerator] Upload failed, returning local URI:', uploadError);
          // Continue with local URI
        }
      }

      onProgress?.('upload', 100, 'Complete!');

      return {
        success: true,
        uri,
        filename,
        pageCount: 1,
        warnings: []
      };
    } catch (error) {
      console.error('[DashPDFGenerator] renderToPDFFile failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF rendering failed'
      };
    }
  }

  /**
   * Upload PDF to Supabase Storage
   */
  private async uploadToStorage(localUri: string, filename: string): Promise<string> {
    try {
      let session = await getCurrentSession();
      if (!session?.user_id) {
        const supabase = assertSupabase();
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session?.user?.id) {
          session = {
            user_id: authData.session.user.id,
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token || '',
            expires_at: authData.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
          } as any;
        }
      }

      if (!session?.user_id) {
        throw new Error('User not authenticated');
      }

      let profile = await getCurrentProfile();
      if (!profile) {
        const { data: profileRow } = await assertSupabase()
          .from('profiles')
          .select('preschool_id, organization_id')
          .eq('auth_user_id', session.user_id)
          .maybeSingle();
        profile = profileRow as any;
      }

      const organizationId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

      const storagePath = organizationId 
        ? `${organizationId}/${session.user_id}/${filename}`
        : `${session.user_id}/${filename}`;

      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error('File not found');
      }

      if (Platform.OS === 'web') {
        const fileData = await FileSystem.readAsStringAsync(localUri, {
          encoding: 'base64',
        });
        const blob = this.base64ToBlob(fileData, 'application/pdf');
        const supabase = assertSupabase();
        const { error } = await supabase.storage
          .from('generated-pdfs')
          .upload(storagePath, blob, {
            contentType: 'application/pdf',
            upsert: false,
          });

        if (error) {
          throw error;
        }
      } else {
        const expoConfig = Constants.expoConfig?.extra || {};
        const supabaseUrl =
          expoConfig.EXPO_PUBLIC_SUPABASE_URL ||
          process.env.EXPO_PUBLIC_SUPABASE_URL ||
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          '';
        if (!supabaseUrl) {
          throw new Error('Supabase URL not configured');
        }

        const encodedPath = storagePath
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const uploadUrl = `${supabaseUrl}/storage/v1/object/generated-pdfs/${encodedPath}`;
        const anonKey =
          expoConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          '';
        if (!anonKey) {
          throw new Error('Supabase anon key not configured');
        }

        const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
          httpMethod: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'Content-Type': 'application/pdf',
            'x-upsert': 'false',
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          const details = uploadResult.body ? `: ${uploadResult.body}` : '';
          throw new Error(`Storage upload failed (${uploadResult.status})${details}`);
        }
      }

      // TODO: Optionally store metadata in pdf_documents table

      return storagePath;
    } catch (error) {
      console.error('[DashPDFGenerator] uploadToStorage failed:', error);
      throw error;
    }
  }

  /**
   * Convert base64 to Blob using safe utility (atob is not available in React Native)
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    // Import synchronously from the utility - this method is called after async setup
    const { base64ToUint8Array } = require('@/lib/utils/base64');
    const byteArray = base64ToUint8Array(base64);
    return new Blob([byteArray], { type: mimeType });
  }
}

// ====================================================================
// SINGLETON INSTANCE
// ====================================================================

let instance: DashPDFGeneratorImpl | null = null;

/**
 * Get singleton instance of DashPDFGenerator
 */
export function getDashPDFGenerator(): DashPDFGeneratorImpl {
  if (!instance) {
    instance = new DashPDFGeneratorImpl();
  }
  return instance;
}

/**
 * Default export for convenience
 */
export const DashPDFGenerator = {
  getInstance: getDashPDFGenerator,
};

export default DashPDFGenerator;
