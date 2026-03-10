export interface DashAssistantProps {
  conversationId?: string;
  onClose?: () => void;
  initialMessage?: string;
  handoffSource?: string;
  uiMode?: 'advisor' | 'tutor' | 'orb' | 'exam' | null;
  /** Disable all text-to-speech controls for this assistant instance. */
  disableTts?: boolean;
  /** Disable follow-up/quick chips for this assistant instance. */
  disableQuickChips?: boolean;
  /** Pre-configured tutor mode — kept for routing compat but UI stays general */
  tutorMode?: 'quiz' | 'practice' | 'diagnostic' | 'play' | 'explain' | null;
  tutorConfig?: {
    subject?: string;
    grade?: string;
    topic?: string;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    slowLearner?: boolean;
  };
}