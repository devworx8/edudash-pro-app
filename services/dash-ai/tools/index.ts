/**
 * Tool Registry Initialization
 * 
 * Import and register all available tools for Dash AI.
 * Call initializeTools() once on app startup.
 * 
 * Tool Categories:
 * - Database: Query and data retrieval tools
 * - Education: CAPS curriculum, textbooks, exam prep, tutoring
 * - Analytics: Learning progress tracking and insights
 * - Context: User profile and environment tools
 * 
 * @module services/dash-ai/tools
 */

import { DashToolRegistry } from '../DashToolRegistry';
import { logger } from '@/lib/logger';
import { DatabaseQueryTool } from './DatabaseQueryTool';
import { CAPSCurriculumTool } from './CAPSCurriculumTool';
import { UserContextTool } from './UserContextTool';
import { TextbookContentTool } from './TextbookContentTool';
import { ExamPrepTool } from './ExamPrepTool';
import { StudentTutorTool } from './StudentTutorTool';
import { LearningProgressTool } from './LearningProgressTool';
import { MistakePatternTool } from './MistakePatternTool';
import { ContextAwareResourceTool } from './ContextAwareResourceTool';
import { GetChildAcademicSnapshotTool, GenerateStudyPlanTool } from './ChildAcademicSnapshotTool';

/**
 * Initialize all tools and register them with the registry.
 * Call this once on app startup.
 */
export function initializeTools(): void {
  const stats = DashToolRegistry.getStats();
  if (stats.totalTools > 0) {
    logger.debug('Tools', 'Tool registry already initialized', { totalTools: stats.totalTools });
    return;
  }

  logger.info('Tools', 'Initializing agentic tools...');

  // Register Database Tools
  DashToolRegistry.registerTool(DatabaseQueryTool);

  // Register Educational Tools (CAPS Curriculum)
  DashToolRegistry.registerTool(CAPSCurriculumTool);
  DashToolRegistry.registerTool(TextbookContentTool);
  
  // Register Exam Prep & Tutoring Tools
  DashToolRegistry.registerTool(ExamPrepTool);
  DashToolRegistry.registerTool(StudentTutorTool);
  
  // Register Analytics Tools
  DashToolRegistry.registerTool(LearningProgressTool);
  DashToolRegistry.registerTool(MistakePatternTool);
  
  // Register Resource & Context Tools
  DashToolRegistry.registerTool(UserContextTool);
  DashToolRegistry.registerTool(ContextAwareResourceTool);

  // Register Parent-focused Tools
  DashToolRegistry.registerTool(GetChildAcademicSnapshotTool);
  DashToolRegistry.registerTool(GenerateStudyPlanTool);

  // TODO: Add more tools here as they're implemented:
  // DashToolRegistry.registerTool(NavigationTool);
  // DashToolRegistry.registerTool(ReportGenerationTool);
  // DashToolRegistry.registerTool(NotificationTool);

  const initializedStats = DashToolRegistry.getStats();
  logger.info('Tools', `Initialized ${initializedStats.totalTools} tools`);
  logger.debug('Tools', 'By category', initializedStats.toolsByCategory);
  logger.debug('Tools', 'By risk', initializedStats.toolsByRisk);
}

/**
 * Export tool registry for direct access
 */
export { DashToolRegistry } from '../DashToolRegistry';

/**
 * Export individual tools for direct usage if needed
 */
export { DatabaseQueryTool } from './DatabaseQueryTool';
export { CAPSCurriculumTool } from './CAPSCurriculumTool';
export { UserContextTool } from './UserContextTool';
export { TextbookContentTool } from './TextbookContentTool';
export { ExamPrepTool } from './ExamPrepTool';
export { StudentTutorTool } from './StudentTutorTool';
export { LearningProgressTool } from './LearningProgressTool';
export { MistakePatternTool } from './MistakePatternTool';
export { ContextAwareResourceTool } from './ContextAwareResourceTool';
export { GetChildAcademicSnapshotTool, GenerateStudyPlanTool } from './ChildAcademicSnapshotTool';
