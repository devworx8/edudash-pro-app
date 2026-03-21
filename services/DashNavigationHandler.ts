/**
 * Dash Navigation Handler
 * 
 * Enables Dash AI to navigate the app via voice commands.
 * Handles screen routing, history, and command pattern matching.
 */

import { router } from 'expo-router';
import { logger } from '@/lib/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NavigationCommand {
  pattern: RegExp;
  screen: string;
  params?: Record<string, any>;
  description: string;
  aliases?: string[];
}

export interface NavigationResult {
  success: boolean;
  screen?: string;
  error?: string;
  suggestions?: string[];
}

export interface ScreenInfo {
  route: string;
  title: string;
  description: string;
  keywords: string[];
  requiresAuth: boolean;
  roles?: Array<'teacher' | 'principal' | 'parent' | 'student' | 'admin'>;
}

/**
 * DashNavigationHandler interface for dependency injection
 */
export interface IDashNavigationHandler {
  navigateByVoice(command: string): Promise<NavigationResult>;
  navigateToScreen(screenKey: string, params?: Record<string, any>): Promise<NavigationResult>;
  getCurrentScreen(): string | null;
  goBack(): NavigationResult;
  clearHistory(): Promise<void>;
  dispose(): void;
}

export class DashNavigationHandler implements IDashNavigationHandler {
  private navigationHistory: Array<{ screen: string; timestamp: number }> = [];
  private maxHistorySize = 50;

  // Comprehensive screen registry
  private readonly SCREEN_REGISTRY: Record<string, ScreenInfo> = {
    'dashboard': {
      route: '/',
      title: 'Dashboard',
      description: 'Main dashboard',
      keywords: ['home', 'main', 'dashboard', 'start'],
      requiresAuth: true
    },
    'students': {
      route: '/screens/student-management',
      title: 'Student Management',
      description: 'View and manage students',
      keywords: ['students', 'learners', 'pupils', 'children'],
      requiresAuth: true,
      roles: ['teacher', 'principal']
    },
    'lessons': {
      route: '/screens/lessons-hub',
      title: 'Lessons Hub',
      description: 'Browse and manage lessons',
      keywords: ['lessons', 'teaching', 'curriculum', 'content'],
      requiresAuth: true
    },
    'lesson-generator': {
      route: '/screens/ai-lesson-generator',
      title: 'AI Lesson Generator',
      description: 'Create lessons with AI',
      keywords: ['generate', 'create lesson', 'ai lesson', 'make lesson'],
      requiresAuth: true,
      roles: ['teacher', 'principal']
    },
    'preschool-lesson-generator': {
      route: '/screens/preschool-lesson-generator',
      title: 'Preschool Lesson Creator',
      description: 'Create age-appropriate preschool lessons with insights & homework',
      keywords: ['preschool', 'lesson', 'early childhood', 'toddler', 'kindergarten', 'young eagles'],
      requiresAuth: true,
      roles: ['teacher', 'principal']
    },
    'homework': {
      route: '/screens/assign-lesson',
      title: 'Assign Lesson',
      description: 'Create and assign lessons to students',
      keywords: ['homework', 'assignments', 'tasks'],
      requiresAuth: true,
      roles: ['teacher']
    },
    'homework-helper': {
      route: '/screens/ai-homework-helper',
      title: 'AI Homework Helper',
      description: 'Get AI assistance with homework',
      keywords: ['homework help', 'ai helper', 'assistance'],
      requiresAuth: true
    },
    'grading': {
      route: '/screens/ai-homework-grader-live',
      title: 'AI Grading Assistant',
      description: 'Grade homework with AI',
      keywords: ['grade', 'grading', 'marking', 'assessment'],
      requiresAuth: true,
      roles: ['teacher']
    },
    'progress': {
      route: '/screens/ai-progress-analysis',
      title: 'Progress Analysis',
      description: 'Analyze student progress',
      keywords: ['progress', 'analytics', 'performance', 'results'],
      requiresAuth: true,
      roles: ['teacher', 'principal', 'parent']
    },
    'reports': {
      route: '/screens/teacher-reports',
      title: 'Reports',
      description: 'View and generate reports',
      keywords: ['reports', 'statistics', 'data'],
      requiresAuth: true
    },
    'messages': {
      route: '/screens/teacher-message-list',
      title: 'Messages',
      description: 'Send and receive messages',
      keywords: ['messages', 'communication', 'chat', 'inbox'],
      requiresAuth: true
    },
    'parents': {
      route: '/screens/parent-messages',
      title: 'Parent Communication',
      description: 'Communicate with parents',
      keywords: ['parents', 'parent messages', 'parent communication'],
      requiresAuth: true,
      roles: ['teacher', 'principal']
    },
    'worksheets': {
      route: '/screens/worksheet-demo',
      title: 'Worksheet Generator',
      description: 'Create worksheets',
      keywords: ['worksheets', 'activities', 'practice'],
      requiresAuth: true
    },
    'dash-assistant': {
      route: '/screens/dash-assistant',
      title: 'Dash AI Assistant',
      description: 'Chat with Dash',
      keywords: ['dash', 'ai', 'assistant', 'chat', 'help'],
      requiresAuth: true
    },
    'settings': {
      route: '/screens/dash-ai-settings',
      title: 'Settings',
      description: 'App settings and preferences',
      keywords: ['settings', 'preferences', 'config', 'options'],
      requiresAuth: true
    },
    'account': {
      route: '/screens/account',
      title: 'Account',
      description: 'View and edit account',
      keywords: ['account', 'profile', 'user', 'me'],
      requiresAuth: true
    },
    'attendance': {
      route: '/screens/attendance',
      title: 'Attendance',
      description: 'Track student attendance',
      keywords: ['attendance', 'register', 'presence'],
      requiresAuth: true,
      roles: ['teacher', 'principal']
    }
  };

  // Voice command patterns
  private readonly COMMAND_PATTERNS: NavigationCommand[] = [
    // Dashboard
    {
      pattern: /(?:go to |show |open |take me to )?(?:the )?(?:main )?(?:home|dashboard|start)/i,
      screen: 'dashboard',
      description: 'Navigate to dashboard'
    },
    
    // Students
    {
      pattern: /(?:show|view|open|see) (?:my )?(?:students?|learners?|pupils?|children)/i,
      screen: 'students',
      description: 'View students'
    },
    
    // Lessons
    {
      pattern: /(?:show|view|open|see) (?:my )?(?:lessons?|teaching|curriculum)/i,
      screen: 'lessons',
      description: 'Browse lessons'
    },
    {
      pattern: /(?:create|generate|make) (?:a |an )?(?:new )?lesson/i,
      screen: 'lesson-generator',
      description: 'Create new lesson'
    },
    {
      pattern: /lesson (?:generator|creator|builder)/i,
      screen: 'lesson-generator',
      description: 'Open lesson generator'
    },
    {
      pattern: /preschool (?:lesson|activity|teaching)/i,
      screen: 'preschool-lesson-generator',
      description: 'Create preschool lesson'
    },
    {
      pattern: /(?:toddler|early childhood|young eagles) (?:lesson|activity)/i,
      screen: 'preschool-lesson-generator',
      description: 'Create early childhood lesson'
    },
    
    // Homework & Assignments
    {
      pattern: /(?:create|assign|give|make) (?:a )?homework|assignments?/i,
      screen: 'homework',
      description: 'Assign homework'
    },
    {
      pattern: /(?:homework|assignment) (?:help|helper|assistance)/i,
      screen: 'homework-helper',
      description: 'Get homework help'
    },
    {
      pattern: /(?:grade|mark|assess) (?:homework|assignments?)/i,
      screen: 'grading',
      description: 'Grade homework'
    },
    
    // Progress & Analytics
    {
      pattern: /(?:show|view|check|see) (?:student )?(?:progress|performance|results|analytics)/i,
      screen: 'progress',
      description: 'View progress analysis'
    },
    {
      pattern: /(?:show|view|open) (?:my )?reports?/i,
      screen: 'reports',
      description: 'View reports'
    },
    
    // Communication
    {
      pattern: /(?:show|view|open|check) (?:my )?messages?|inbox/i,
      screen: 'messages',
      description: 'View messages'
    },
    {
      pattern: /(?:message|contact|communicate with) parents?/i,
      screen: 'parents',
      description: 'Parent communication'
    },
    
    // Worksheets
    {
      pattern: /(?:create|generate|make) (?:a )?worksheet/i,
      screen: 'worksheets',
      description: 'Create worksheet'
    },
    
    // Dash & Settings
    {
      pattern: /(?:open|show|talk to) dash|ai assistant/i,
      screen: 'dash-assistant',
      description: 'Open Dash assistant'
    },
    {
      pattern: /(?:open|show) settings|preferences|options/i,
      screen: 'settings',
      description: 'Open settings'
    },
    {
      pattern: /(?:my )?(?:account|profile)/i,
      screen: 'account',
      description: 'View account'
    },
    
    // Attendance
    {
      pattern: /(?:take|mark|record) attendance|register/i,
      screen: 'attendance',
      description: 'Mark attendance'
    }
  ];

  /**
   * Navigate based on voice command
   */
  public async navigateByVoice(command: string): Promise<NavigationResult> {
    try {
      const normalized = command.toLowerCase().trim();

      // Try to match command patterns
      for (const cmd of this.COMMAND_PATTERNS) {
        if (cmd.pattern.test(normalized)) {
          return await this.navigateToScreen(cmd.screen, cmd.params);
        }
      }

      // Fuzzy match screen keywords
      const fuzzyMatch = this.fuzzyMatchScreen(normalized);
      if (fuzzyMatch) {
        return await this.navigateToScreen(fuzzyMatch);
      }

      // No match found - provide suggestions
      const suggestions = this.getSuggestions(normalized);
      return {
        success: false,
        error: `I couldn't understand "${command}". Did you mean one of these?`,
        suggestions
      };

    } catch (error) {
      console.error('[DashNav] Navigation failed:', error);
      return {
        success: false,
        error: 'Navigation failed. Please try again.'
      };
    }
  }

  /**
   * Navigate to a specific screen
   */
  public async navigateToScreen(screenKey: string, params?: Record<string, any>): Promise<NavigationResult> {
    try {
      const screenInfo = this.SCREEN_REGISTRY[screenKey];
      
      if (!screenInfo) {
        return {
          success: false,
          error: `Screen "${screenKey}" not found`
        };
      }

      // Navigate using Expo Router
      if (params && Object.keys(params).length > 0) {
        router.push({ pathname: screenInfo.route, params } as any);
      } else {
        router.push(screenInfo.route);
      }

      // Update history
      this.addToHistory(screenKey);

      logger.info('DashNav', `Navigated to: ${screenInfo.title}`);

      return {
        success: true,
        screen: screenInfo.title
      };

    } catch (error) {
      console.error('[DashNav] Navigation error:', error);
      return {
        success: false,
        error: 'Failed to navigate to screen'
      };
    }
  }

  /**
   * Get current screen info
   */
  public getCurrentScreen(): string | null {
    // This would ideally integrate with router state
    // For now, return from history
    if (this.navigationHistory.length > 0) {
      return this.navigationHistory[this.navigationHistory.length - 1].screen;
    }
    return null;
  }

  /**
   * Go back to previous screen
   */
  public goBack(): NavigationResult {
    try {
      router.back();
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Cannot go back' };
    }
  }

  /**
   * Get navigation history
   */
  public getHistory(): Array<{ screen: string; timestamp: number }> {
    return [...this.navigationHistory];
  }

  /**
   * Get all available screens
   */
  public getAllScreens(): ScreenInfo[] {
    return Object.values(this.SCREEN_REGISTRY);
  }

  /**
   * Get screens for specific role
   */
  public getScreensForRole(role: string): ScreenInfo[] {
    return Object.values(this.SCREEN_REGISTRY).filter(screen => 
      !screen.roles || screen.roles.includes(role as any)
    );
  }

  /**
   * Fuzzy match screen based on keywords
   */
  private fuzzyMatchScreen(input: string): string | null {
    const words = input.split(/\s+/);
    
    for (const [key, screen] of Object.entries(this.SCREEN_REGISTRY)) {
      for (const keyword of screen.keywords) {
        if (words.some(word => keyword.includes(word) || word.includes(keyword))) {
          return key;
        }
      }
    }
    
    return null;
  }

  /**
   * Get navigation suggestions based on input
   */
  private getSuggestions(input: string): string[] {
    const suggestions: string[] = [];
    const words = input.split(/\s+/);

    for (const screen of Object.values(this.SCREEN_REGISTRY)) {
      for (const keyword of screen.keywords) {
        if (words.some(word => keyword.startsWith(word.substring(0, 3)))) {
          suggestions.push(screen.title);
          break;
        }
      }
    }

    // Return top 3 suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Add screen to navigation history
   */
  private addToHistory(screen: string): void {
    this.navigationHistory.push({
      screen,
      timestamp: Date.now()
    });

    // Trim history if too large
    if (this.navigationHistory.length > this.maxHistorySize) {
      this.navigationHistory = this.navigationHistory.slice(-this.maxHistorySize);
    }

    // Persist history
    this.saveNavigationHistory();
  }

  /**
   * Load navigation history from storage
   */
  private async loadNavigationHistory(): Promise<void> {
    try {
      const history = await AsyncStorage.getItem('@dash_navigation_history');
      if (history) {
        this.navigationHistory = JSON.parse(history);
      }
    } catch (error) {
      console.error('[DashNav] Failed to load history:', error);
    }
  }

  /**
   * Save navigation history to storage
   */
  private async saveNavigationHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        '@dash_navigation_history',
        JSON.stringify(this.navigationHistory)
      );
    } catch (error) {
      console.error('[DashNav] Failed to save history:', error);
    }
  }

  /**
   * Clear navigation history
   */
  public async clearHistory(): Promise<void> {
    this.navigationHistory = [];
    await AsyncStorage.removeItem('@dash_navigation_history');
  }

  /**
   * Dispose method for cleanup
   */
  dispose(): void {
    this.navigationHistory = [];
  }
}

