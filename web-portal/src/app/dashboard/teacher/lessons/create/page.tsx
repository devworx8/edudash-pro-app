'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { Sparkles, BookOpen, Clock, Target, Lightbulb, Save, Wand2 } from 'lucide-react';
import { LessonPlanRenderer } from '@/components/dashboard/teacher/LessonPlanRenderer';
import {
  buildQuickLessonThemeHint,
  loadQuickLessonThemeContext,
  summarizeQuickLessonContext,
  type QuickLessonThemeContext,
} from '@/lib/lesson-planning/quickLessonThemeContext';
import {
  buildPreschoolSpecialistBlock,
  buildPreschoolOutputFormat,
} from '@/lib/lesson-planning/preschoolLessonPrompt';

function CreateLessonPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const quickDefaultsApplied = useRef(false);
  
  // Form state
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [duration, setDuration] = useState('30');
  const [objectives, setObjectives] = useState('');
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);
  const [quickLessonContext, setQuickLessonContext] = useState<QuickLessonThemeContext | null>(null);
  const [quickLessonContextLoading, setQuickLessonContextLoading] = useState(false);
  
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const isQuickMode = searchParams.get('mode') === 'quick';
  const stemParam = searchParams.get('stem');
  const isPreschool = profile?.usageType === 'preschool' || profile?.schoolType === 'preschool';
  const schoolId = profile?.organizationId || profile?.preschoolId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (quickDefaultsApplied.current) return;
    if (!profileLoading) {
      if (stemParam && !subject) {
        const stemMap: Record<string, string> = {
          ai: 'AI & Technology',
          robotics: 'Robotics',
          computer_literacy: 'Computer Literacy',
        };
        setSubject(stemMap[stemParam] || stemParam);
      }
      if (isQuickMode) {
        setDuration('15');
        if (!subject) setSubject('General');
        if (!objectives) setObjectives('Quick, engaging activity with minimal prep');
      }
      quickDefaultsApplied.current = true;
    }
  }, [isQuickMode, stemParam, profileLoading, subject, objectives]);

  useEffect(() => {
    if (!schoolId || !userId) return;
    let cancelled = false;

    const loadContext = async () => {
      setQuickLessonContextLoading(true);
      const context = await loadQuickLessonThemeContext({
        supabase,
        preschoolId: schoolId,
        teacherId: userId,
      });
      if (!cancelled) {
        setQuickLessonContext(context);
        setQuickLessonContextLoading(false);
      }
    };

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [schoolId, supabase, userId]);

  const handleGenerateWithAI = async () => {
    if (!topic || !gradeLevel) {
      alert('Please fill in at least the topic and grade level');
      return;
    }

    setGenerating(true);
    try {
      const durationNum = parseInt(duration, 10) || 30;
      let prompt: string;

      if (isPreschool) {
        // Preschool specialist: ECD-aligned, play-based, SA context
        const ageRange =
          gradeLevel === 'Toddlers'
            ? '1-2'
            : gradeLevel === 'Preschool'
              ? '3-4'
              : gradeLevel === 'Pre-K'
                ? '4-5'
                : '5-6';
        const specialistBlock = buildPreschoolSpecialistBlock({
          ageGroup: gradeLevel,
          ageRange,
          durationMinutes: durationNum,
          language: 'en',
          quickMode: isQuickMode,
          themeContext: quickLessonContext ?? undefined,
          subjectHint: subject || undefined,
        });
        const formatBlock = buildPreschoolOutputFormat({
          durationMinutes: durationNum,
          includeTakeHome: true,
          includeTeacherNotes: true,
        });
        prompt = `${specialistBlock}\n\n**TOPIC:** ${topic}\n${objectives ? `**ADDITIONAL OBJECTIVES (weave in):** ${objectives}\n` : ''}\n${formatBlock}`;
      } else {
        const quickHint = isQuickMode
          ? 'This is a QUICK, low-prep lesson. Use minimal materials, high engagement, and clear step-by-step guidance.'
          : '';
        const planningHint = buildQuickLessonThemeHint(quickLessonContext);
        prompt = `Generate a ${isQuickMode ? 'quick, engaging' : 'comprehensive'} lesson plan for school:

Subject: ${subject || 'General'}
Topic: ${topic}
Grade Level: ${gradeLevel}
Duration: ${duration} minutes
Learning Objectives: ${objectives || 'Age-appropriate learning goals'}
${quickHint ? `\nQuick Lesson Guidance: ${quickHint}\n` : ''}
${planningHint ? `\nPlanning Alignment Context:\n${planningHint}\n` : ''}

Provide clear sections: Lesson Title; Learning Objectives (3-5); Materials Needed; Introduction/Warm-up (5 mins); Main Activity (detailed steps); Practice Activity; Cool-down/Conclusion; Assessment Ideas; Extension Activities; Notes for Teachers. Use ## for main headings.`;
      }

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          scope: 'teacher',
          service_type: 'chat_message',
          payload: {
            prompt,
            model: 'claude-3-5-haiku-20241022',
          },
          stream: false,
          enable_tools: false,
          metadata: { source: 'teacher_lesson_generator', is_preschool: isPreschool },
        },
      });

      if (error) throw error;

      setGeneratedLesson({
        title: `${topic} - ${gradeLevel}`,
        content: data.content,
        subject,
        topic,
        gradeLevel,
        duration: durationNum,
        objectives,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error generating lesson:', error);
      alert('Failed to generate lesson plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveLesson = async () => {
    if (!generatedLesson) return;

    setSaving(true);
    try {
      // Get user's profile (profiles-first architecture)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, preschool_id, organization_id')
        .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
        .maybeSingle();

      if (!profile) throw new Error('Profile not found');
      const schoolId = profile.organization_id || profile.preschool_id;
      if (!schoolId) throw new Error('School not found for this teacher');

      const now = new Date().toISOString();
      const normalizedContent =
        typeof generatedLesson.content === 'string'
          ? {
              sections: [
                {
                  title: generatedLesson.title,
                  content: generatedLesson.content,
                },
              ],
            }
          : generatedLesson.content;

      const { error } = await supabase
        .from('lessons')
        .insert({
          teacher_id: profile.id,
          preschool_id: schoolId,
          title: generatedLesson.title,
          description:
            typeof generatedLesson.content === 'string'
              ? generatedLesson.content.slice(0, 280)
              : `AI-generated lesson for ${generatedLesson.topic}`,
          content: normalizedContent,
          objectives: generatedLesson.objectives
            ? generatedLesson.objectives
                .split('\n')
                .map((line: string) => line.replace(/^[-•]\s*/, '').trim())
                .filter(Boolean)
            : [],
          age_group: generatedLesson.gradeLevel || (isPreschool ? '3-6' : 'Grade 1'),
          subject: generatedLesson.subject || 'general',
          duration_minutes: Number(generatedLesson.duration) || 30,
          status: 'active',
          is_ai_generated: true,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (error) throw error;

      alert('Lesson plan saved successfully!');
      router.push('/dashboard/teacher/lessons');
    } catch (error) {
      console.error('Error saving lesson:', error);
      alert('Failed to save lesson plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <TeacherShell 
      tenantSlug={tenantSlug} 
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
      hideHeader={true}
    >
      <div className="container">
        <div className="section">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-600 to-green-700 rounded-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="h1">AI Lesson Generator</h1>
              <p className="muted">Create engaging lesson plans with AI assistance</p>
            </div>
          </div>
          {isQuickMode && (
            <div className="mt-4 rounded-2xl border border-green-700/70 bg-green-900/35 px-4 py-3 text-sm text-green-200">
              <div className="inline-flex items-center gap-2 font-semibold">
                <Wand2 className="h-4 w-4" />
                Quick Lesson Mode • 15 minutes • Low prep
              </div>
              <p className="mt-2 text-xs text-green-100/90">
                {quickLessonContextLoading
                  ? 'Loading this week’s planning alignment...'
                  : summarizeQuickLessonContext(quickLessonContext)}
              </p>
            </div>
          )}
        </div>

        <div className="section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Form */}
            <div className="card p-md">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-green-500" />
                Lesson Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Math, Science, Language"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Topic *</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Counting to 10, Colors, Shapes"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Grade Level *</label>
                  <select
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  >
                    <option value="">Select grade level</option>
                    {isPreschool ? (
                      <>
                        <option value="Toddlers">Toddlers (1-2 years)</option>
                        <option value="Preschool">Preschool (3-4 years)</option>
                        <option value="Pre-K">Pre-K (4-5 years)</option>
                        <option value="Grade R">Grade R (5-6 years)</option>
                      </>
                    ) : (
                      <>
                        <option value="Pre-K">Pre-K (3-4 years)</option>
                        <option value="Kindergarten">Kindergarten (4-5 years)</option>
                        <option value="Grade R">Grade R (5-6 years)</option>
                        <option value="Grade 1">Grade 1 (6-7 years)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    min="15"
                    max="120"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Learning Objectives (optional)
                  </label>
                  <textarea
                    value={objectives}
                    onChange={(e) => setObjectives(e.target.value)}
                    placeholder="What should students learn from this lesson?"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <button
                  onClick={handleGenerateWithAI}
                  disabled={generating || !topic || !gradeLevel}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-700 disabled:to-gray-700 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed shadow-lg"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5" />
                      Generate with AI
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Generated Output */}
            <div className="card p-md">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                Generated Lesson Plan
              </h2>

              {!generatedLesson ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="w-16 h-16 text-gray-600 mb-4" />
                  <p className="text-gray-400 mb-2">Your AI-generated lesson plan will appear here</p>
                  <p className="text-sm text-gray-500">Fill in the form and click "Generate with AI"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="max-h-[28rem] overflow-y-auto pr-1">
                    <LessonPlanRenderer
                      title={generatedLesson.title}
                      content={typeof generatedLesson.content === 'string' ? generatedLesson.content : ''}
                      meta={{
                        gradeLevel: generatedLesson.gradeLevel,
                        duration: generatedLesson.duration,
                        subject: generatedLesson.subject,
                      }}
                    />
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-700">
                    <button
                      onClick={handleSaveLesson}
                      disabled={saving}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Lesson
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setGeneratedLesson(null)}
                      className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Tips */}
        <div className="section">
          <div className="card p-md bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-700/30">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
              Tips for Better Results
            </h3>
            {isPreschool && (
              <p className="text-sm text-emerald-200/90 mb-3 rounded-lg bg-emerald-900/20 px-3 py-2 border border-emerald-700/30">
                <strong>Preschool mode:</strong> Lessons are ECD-aligned, play-based, and include differentiation, teacher notes, and take-home activities. They follow developmentally appropriate practice and South African context.
              </p>
            )}
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Be specific with your topic (e.g., &quot;Counting to 10 with animals&quot; instead of just &quot;Numbers&quot;)</li>
              <li>• Specify any particular teaching methods or materials you prefer in objectives</li>
              <li>• Consider your students&apos; attention span when setting duration</li>
              <li>• Generated lessons are starting points — feel free to customize and adapt them</li>
              <li>• Use <strong>Print lesson</strong> for a clean, printable plan</li>
            </ul>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}

export default function CreateLessonPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <CreateLessonPageInner />
    </Suspense>
  );
}
