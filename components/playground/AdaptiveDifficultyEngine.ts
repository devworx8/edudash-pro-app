// Adaptive Difficulty Engine for Dash Playground
// Adjusts difficulty based on child's performance in real-time

export interface PerformanceEntry {
  activityId: string;
  activityType: string;
  timestamp: string;
  score: number;
  timeSpent: number;
  hintsUsed: number;
  correctAnswers: number;
  totalQuestions: number;
  difficultyLevel: number;
}

export interface DifficultyState {
  currentLevel: number; // 1-5 scale
  consecutiveCorrect: number;
  consecutiveWrong: number;
  averageTimePerQuestion: number;
  recentPerformance: PerformanceEntry[];
  lastAdjustment: string | null;
}

export interface DifficultyAdjustment {
  newLevel: number;
  reason: string;
  confidence: number;
  suggestedActivityTypes: string[];
}

export interface AdaptiveConfig {
  minLevel: number;
  maxLevel: number;
  correctStreakThreshold: number;
  wrongStreakThreshold: number;
  performanceWindowSize: number;
  adjustmentCooldown: number; // milliseconds
}

const DEFAULT_CONFIG: AdaptiveConfig = {
  minLevel: 1,
  maxLevel: 5,
  correctStreakThreshold: 3,
  wrongStreakThreshold: 2,
  performanceWindowSize: 10,
  adjustmentCooldown: 30000, // 30 seconds
};

export class AdaptiveDifficultyEngine {
  private state: DifficultyState;
  private config: AdaptiveConfig;

  constructor(initialLevel: number = 1, config: Partial<AdaptiveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      currentLevel: Math.max(this.config.minLevel, Math.min(this.config.maxLevel, initialLevel)),
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      averageTimePerQuestion: 0,
      recentPerformance: [],
      lastAdjustment: null,
    };
  }

  getState(): DifficultyState {
    return { ...this.state };
  }

  getCurrentLevel(): number {
    return this.state.currentLevel;
  }

  recordPerformance(entry: Omit<PerformanceEntry, 'timestamp' | 'difficultyLevel'>): DifficultyAdjustment | null {
    const fullEntry: PerformanceEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      difficultyLevel: this.state.currentLevel,
    };

    // Update consecutive counts
    const successRate = entry.correctAnswers / entry.totalQuestions;
    if (successRate >= 0.8) {
      this.state.consecutiveCorrect++;
      this.state.consecutiveWrong = 0;
    } else if (successRate < 0.5) {
      this.state.consecutiveWrong++;
      this.state.consecutiveCorrect = 0;
    } else {
      this.state.consecutiveCorrect = 0;
      this.state.consecutiveWrong = 0;
    }

    // Update average time
    const timePerQuestion = entry.timeSpent / entry.totalQuestions;
    if (this.state.averageTimePerQuestion === 0) {
      this.state.averageTimePerQuestion = timePerQuestion;
    } else {
      this.state.averageTimePerQuestion =
        this.state.averageTimePerQuestion * 0.7 + timePerQuestion * 0.3;
    }

    // Add to recent performance
    this.state.recentPerformance.push(fullEntry);
    if (this.state.recentPerformance.length > this.config.performanceWindowSize) {
      this.state.recentPerformance.shift();
    }

    // Check for difficulty adjustment
    return this.evaluateAdjustment();
  }

  private evaluateAdjustment(): DifficultyAdjustment | null {
    const now = Date.now();
    
    // Check cooldown
    if (this.state.lastAdjustment) {
      const lastAdjustmentTime = new Date(this.state.lastAdjustment).getTime();
      if (now - lastAdjustmentTime < this.config.adjustmentCooldown) {
        return null;
      }
    }

    // Check for level increase
    if (
      this.state.consecutiveCorrect >= this.config.correctStreakThreshold &&
      this.state.currentLevel < this.config.maxLevel
    ) {
      return this.createAdjustment(this.state.currentLevel + 1, 'correct_streak');
    }

    // Check for level decrease
    if (
      this.state.consecutiveWrong >= this.config.wrongStreakThreshold &&
      this.state.currentLevel > this.config.minLevel
    ) {
      return this.createAdjustment(this.state.currentLevel - 1, 'wrong_streak');
    }

    // Analyze recent performance for subtle adjustments
    if (this.state.recentPerformance.length >= 5) {
      const analysis = this.analyzeRecentPerformance();
      if (analysis) {
        return analysis;
      }
    }

    return null;
  }

  private analyzeRecentPerformance(): DifficultyAdjustment | null {
    const recent = this.state.recentPerformance.slice(-5);
    
    const avgScore = recent.reduce((sum, p) => sum + p.score, 0) / recent.length;
    const avgTime = recent.reduce((sum, p) => sum + p.timeSpent / p.totalQuestions, 0) / recent.length;

    // Very high performance - increase difficulty
    if (avgScore >= 95 && this.state.currentLevel < this.config.maxLevel) {
      return this.createAdjustment(this.state.currentLevel + 1, 'excellent_performance');
    }

    // Very low performance - decrease difficulty
    if (avgScore < 50 && this.state.currentLevel > this.config.minLevel) {
      return this.createAdjustment(this.state.currentLevel - 1, 'struggling');
    }

    // Fast completion with good scores - increase difficulty
    if (
      avgScore >= 80 &&
      avgTime < this.state.averageTimePerQuestion * 0.6 &&
      this.state.currentLevel < this.config.maxLevel
    ) {
      return this.createAdjustment(this.state.currentLevel + 1, 'fast_completion');
    }

    // Slow completion with lower scores - decrease difficulty
    if (
      avgScore < 70 &&
      avgTime > this.state.averageTimePerQuestion * 1.5 &&
      this.state.currentLevel > this.config.minLevel
    ) {
      return this.createAdjustment(this.state.currentLevel - 1, 'slow_struggling');
    }

    return null;
  }

  private createAdjustment(newLevel: number, reason: string): DifficultyAdjustment {
    this.state.currentLevel = newLevel;
    this.state.lastAdjustment = new Date().toISOString();
    this.state.consecutiveCorrect = 0;
    this.state.consecutiveWrong = 0;

    return {
      newLevel,
      reason: this.getReasonDescription(reason),
      confidence: this.calculateConfidence(reason),
      suggestedActivityTypes: this.getSuggestedActivities(newLevel),
    };
  }

  private getReasonDescription(reason: string): string {
    const descriptions: Record<string, string> = {
      correct_streak: "You're doing great! Let's try something a bit more challenging.",
      wrong_streak: "Let's try an easier one to build confidence.",
      excellent_performance: "Amazing work! Ready for the next level?",
      struggling: "This seems tricky. Let's practice with easier activities.",
      fast_completion: "You're super fast! Let's make it more interesting.",
      slow_struggling: "Take your time. Let's try simpler activities.",
    };
    return descriptions[reason] || "Adjusting difficulty for optimal learning.";
  }

  private calculateConfidence(reason: string): number {
    const confidenceLevels: Record<string, number> = {
      correct_streak: 0.9,
      wrong_streak: 0.95,
      excellent_performance: 0.85,
      struggling: 0.9,
      fast_completion: 0.7,
      slow_struggling: 0.75,
    };
    return confidenceLevels[reason] || 0.5;
  }

  private getSuggestedActivities(level: number): string[] {
    const activitiesByLevel: Record<number, string[]> = {
      1: ['emoji_counting', 'color_match', 'shape_sort', 'animal_sounds'],
      2: ['memory_flip', 'pattern_complete', 'sound_match', 'body_parts'],
      3: ['phonics_sounds', 'sight_words', 'addition_basics', 'emotions_game'],
      4: ['spelling_simple', 'rhyming_words', 'subtraction_basics', 'story_sequence'],
      5: ['science_explore', 'social_skills', 'story_builder', 'fine_motor'],
    };
    return activitiesByLevel[level] || activitiesByLevel[3];
  }

  // Get appropriate parameters for current difficulty level
  getLevelParameters(): DifficultyParameters {
    const level = this.state.currentLevel;
    return {
      questionCount: 4 + level * 2, // 6-14 questions
      timeLimit: level <= 2 ? 0 : 30 + (5 - level) * 15, // No time limit for easy levels
      hintAvailability: level <= 3,
      visualSupport: level <= 3,
      audioSupport: true,
      maxAttempts: level <= 2 ? 3 : level <= 4 ? 2 : 1,
    };
  }

  // Reset engine state
  reset(initialLevel: number = 1): void {
    this.state = {
      currentLevel: Math.max(this.config.minLevel, Math.min(this.config.maxLevel, initialLevel)),
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      averageTimePerQuestion: 0,
      recentPerformance: [],
      lastAdjustment: null,
    };
  }
}

export interface DifficultyParameters {
  questionCount: number;
  timeLimit: number;
  hintAvailability: boolean;
  visualSupport: boolean;
  audioSupport: boolean;
  maxAttempts: number;
}

// Singleton instance for global use
let engineInstance: AdaptiveDifficultyEngine | null = null;

export function getAdaptiveEngine(initialLevel?: number, config?: Partial<AdaptiveConfig>): AdaptiveDifficultyEngine {
  if (!engineInstance) {
    engineInstance = new AdaptiveDifficultyEngine(initialLevel, config);
  }
  return engineInstance;
}

export function resetAdaptiveEngine(initialLevel: number = 1): void {
  engineInstance = new AdaptiveDifficultyEngine(initialLevel);
}