/**
 * PracticeAtHomeSection (Web)
 *
 * Contains the Practice at Home, Early Learning Activities,
 * and Early Learning Tips collapsible sections.
 *
 * Extracted from parent/page.tsx to reduce file size.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '@/components/dashboard/parent/CollapsibleSection';
import { CAPSActivitiesWidget } from '@/components/dashboard/parent/CAPSActivitiesWidget';
import { BookOpen, Sparkles, Lightbulb, Brain, Cpu, Laptop, PenTool } from 'lucide-react';
import type { ParentDashboardCopy } from '@/app/dashboard/parent/parentDashboardCopy';

interface SectionEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function SectionEmptyState({ title, description, actionLabel, onAction }: SectionEmptyStateProps) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--muted)' }}>{description}</p>
      {actionLabel && onAction && (
        <button className="btn btnPrimary btnSmall" style={{ marginTop: 12 }} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

interface ActiveChild {
  id: string;
  firstName: string;
  grade?: string;
}

interface PracticeAtHomeSectionProps {
  COPY: ParentDashboardCopy;
  openSection: string | null;
  toggleSection: (key: string) => void;
  hasAnyChild: boolean;
  hasChildren: boolean;
  activeChild: ActiveChild | null;
  activeChildIsPreschool: boolean;
  activeChildAge: number;
  allChildrenArePreschoolers: boolean;
  childrenCount: number;
  handleAskFromActivity: (prompt: string, display: string) => void;
}

export function PracticeAtHomeSection({
  COPY,
  openSection,
  toggleSection,
  hasAnyChild,
  hasChildren,
  activeChild,
  activeChildIsPreschool,
  activeChildAge,
  allChildrenArePreschoolers,
  childrenCount,
  handleAskFromActivity,
}: PracticeAtHomeSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <>
      {/* Practice at Home Hub - STEM Activities */}
      <CollapsibleSection
        title={COPY.sections.practiceAtHome}
        description={COPY.sectionDescriptions.practiceAtHome}
        icon={Sparkles}
        isOpen={openSection === 'practice'}
        onToggle={() => toggleSection('practice')}
      >
        {hasAnyChild && activeChild ? (
          <div className="grid2" style={{ marginTop: 16 }}>
            {activeChildIsPreschool ? (
              <>
                <PracticeCard
                  gradient="linear-gradient(135deg, #f97316 0%, #facc15 100%)"
                  icon={<Sparkles className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.preschoolPlay.title}
                  description={COPY.practiceCards.preschoolPlay.description}
                  onClick={() =>
                    handleAskFromActivity(
                      t('dashboard.parent.practice.preschool_play.prompt', { defaultValue: 'Share 3 play-based learning activities for a preschool child (simple, fun, and safe).' }),
                      t('dashboard.parent.practice.preschool_play.display', { defaultValue: 'Play-Based Learning Ideas' })
                    )
                  }
                />
                <PracticeCard
                  gradient="linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                  icon={<BookOpen className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.preschoolLiteracy.title}
                  description={COPY.practiceCards.preschoolLiteracy.description}
                  onClick={() =>
                    handleAskFromActivity(
                      t('dashboard.parent.practice.preschool_literacy.prompt', { defaultValue: 'Give early literacy activities for preschoolers using songs, rhymes, and picture books.' }),
                      t('dashboard.parent.practice.preschool_literacy.display', { defaultValue: 'Early Literacy Activities' })
                    )
                  }
                />
                <PracticeCard
                  gradient="linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)"
                  icon={<Lightbulb className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.preschoolMath.title}
                  description={COPY.practiceCards.preschoolMath.description}
                  onClick={() =>
                    handleAskFromActivity(
                      t('dashboard.parent.practice.preschool_math.prompt', { defaultValue: 'Suggest simple counting and shapes activities for a preschool child using everyday items.' }),
                      t('dashboard.parent.practice.preschool_math.display', { defaultValue: 'Numbers & Shapes Practice' })
                    )
                  }
                />
                <PracticeCard
                  gradient="linear-gradient(135deg, #2563eb 0%, #14b8a6 100%)"
                  icon={<PenTool className="icon24" style={{ marginBottom: 8 }} />}
                  title={t('dashboard.parent.practice.name_writing.title', { defaultValue: 'Name Writing Practice' })}
                  description={t('dashboard.parent.practice.name_writing.description', { defaultValue: 'Daily guided tracing and phonics cues to build name-writing confidence.' })}
                  onClick={() => {
                    const childName = activeChild?.firstName || '';
                    router.push(`/dashboard/parent/name-practice?studentId=${activeChild?.id || ''}&name=${encodeURIComponent(childName)}`);
                  }}
                />
              </>
            ) : (
              <>
                <PracticeCard
                  gradient="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"
                  icon={<Cpu className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.robotics.title}
                  description={COPY.practiceCards.robotics.description}
                  onClick={() => router.push('/dashboard/parent/robotics')}
                />
                <PracticeCard
                  gradient="linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                  icon={<Brain className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.aiActivities.title}
                  description={COPY.practiceCards.aiActivities.description}
                  onClick={() =>
                    handleAskFromActivity(
                      t('dashboard.parent.practice.ai.prompt', { defaultValue: 'Help me create age-appropriate AI learning activities for my child' }),
                      t('dashboard.parent.practice.ai.display', { defaultValue: 'AI Learning Activities' })
                    )
                  }
                />
                <PracticeCard
                  gradient="linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)"
                  icon={<Laptop className="icon24" style={{ marginBottom: 8 }} />}
                  title={COPY.practiceCards.computerLiteracy.title}
                  description={COPY.practiceCards.computerLiteracy.description}
                  onClick={() =>
                    handleAskFromActivity(
                      t('dashboard.parent.practice.computer.prompt', { defaultValue: 'Help me teach my child basic computer skills like using a mouse, keyboard, and safe online practices' }),
                      t('dashboard.parent.practice.computer.display', { defaultValue: 'Computer Literacy Guide' })
                    )
                  }
                />
              </>
            )}
          </div>
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.practice.title', { defaultValue: 'Practice at home preview' })}
            description={t('dashboard.parent.empty.practice.description', { defaultValue: 'Practice activities will appear here after a child is linked.' })}
            actionLabel={t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
            onAction={() => router.push('/dashboard/parent/register-child')}
          />
        )}
      </CollapsibleSection>

      {/* Early Learning Activities - ONLY for preschoolers */}
      <CollapsibleSection
        title={COPY.sections.earlyLearningActivities}
        description={COPY.sectionDescriptions.earlyLearningActivities}
        icon={BookOpen}
        isOpen={openSection === 'activities'}
        onToggle={() => toggleSection('activities')}
      >
        {allChildrenArePreschoolers && activeChild ? (
          <CAPSActivitiesWidget
            childAge={activeChildAge}
            childName={activeChild.firstName}
            onAskDashAI={(prompt, display) => handleAskFromActivity(prompt, display)}
          />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.early_learning_activities.title', { defaultValue: 'Early learning activities preview' })}
            description={
              hasChildren
                ? t('dashboard.parent.empty.early_learning_activities.description_preschool_only', { defaultValue: 'These activities are available for preschool-age children.' })
                : t('dashboard.parent.empty.early_learning_activities.description_add_child', { defaultValue: 'Add a child to unlock early learning activities.' })
            }
            actionLabel={hasChildren ? undefined : t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
            onAction={hasChildren ? undefined : () => router.push('/dashboard/parent/register-child')}
          />
        )}
      </CollapsibleSection>

      {/* Preschool Learning Tips - ONLY for preschoolers */}
      <CollapsibleSection
        title={COPY.sections.earlyLearningTips}
        description={COPY.sectionDescriptions.earlyLearningTips}
        icon={Lightbulb}
        isOpen={openSection === 'tips'}
        onToggle={() => toggleSection('tips')}
      >
        {allChildrenArePreschoolers && childrenCount > 0 ? (
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>{COPY.earlyLearning.heading}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {COPY.earlyLearning.tips.map((tip: { title: string; description: string }) => (
                <div key={tip.title}>
                  <strong>{tip.title}</strong>
                  <p style={{ margin: '4px 0', color: 'var(--muted)' }}>{tip.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.early_learning_tips.title', { defaultValue: 'Early learning tips preview' })}
            description={
              hasChildren
                ? t('dashboard.parent.empty.early_learning_tips.description_preschool_only', { defaultValue: 'Tips are tailored for preschool-age children.' })
                : t('dashboard.parent.empty.early_learning_tips.description_add_child', { defaultValue: 'Add a child to unlock early learning tips.' })
            }
            actionLabel={hasChildren ? undefined : t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
            onAction={hasChildren ? undefined : () => router.push('/dashboard/parent/register-child')}
          />
        )}
      </CollapsibleSection>
    </>
  );
}

// --- Presentational sub-component ---

interface PracticeCardProps {
  gradient: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function PracticeCard({ gradient, icon, title, description, onClick }: PracticeCardProps) {
  return (
    <div
      className="card card-interactive"
      onClick={onClick}
      style={{ background: gradient, color: 'white', border: 'none', cursor: 'pointer' }}
    >
      {icon}
      <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{description}</p>
    </div>
  );
}
