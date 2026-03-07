'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { BookOpen, Calendar, FileText, Megaphone, Save, UploadCloud } from 'lucide-react';

interface ClassOption {
  id: string;
  name: string;
  grade_level: string | null;
  preschool_id: string;
  organization_id: string | null;
}

interface ProfileContext {
  id: string;
  preschool_id: string | null;
  organization_id: string | null;
}

const DEFAULT_STEPS = [
  'Observe and name the shapes on the worksheet.',
  'Trace or color matching shapes with one consistent color per shape group.',
  'Use short repetition prompts: “Find another one like this.”',
  'Close with name writing practice and one phonics clip review.',
];

const REPETITION_BLOCKS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
] as const;

type RepetitionKey = (typeof REPETITION_BLOCKS)[number]['key'];

export default function CreateHomeworkPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string>();
  const [legacyTeacherId, setLegacyTeacherId] = useState<string | null>(null);
  const [profileContext, setProfileContext] = useState<ProfileContext | null>(null);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [classId, setClassId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [requiresMedia, setRequiresMedia] = useState(true);

  const [worksheetType, setWorksheetType] = useState('shape-matching');
  const [ageBand, setAgeBand] = useState('4-5 years');
  const [parentPrompt, setParentPrompt] = useState('Focus on repetition, gentle guidance, and short encouragement phrases.');
  const [steps, setSteps] = useState<string[]>(DEFAULT_STEPS);
  const [weatherDaily, setWeatherDaily] = useState(true);
  const [namePracticeEnabled, setNamePracticeEnabled] = useState(true);
  const [phonicsPackId, setPhonicsPackId] = useState('starter_en_za_v1');
  const [repetitionDays, setRepetitionDays] = useState<Record<RepetitionKey, boolean>>({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
  });
  const [attachments, setAttachments] = useState<File[]>([]);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const shellEmail = profile?.email;
  const shellUserName = profile?.firstName;
  const shellPreschoolName = profile?.preschoolName;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserId(session.user.id);

      const profileRes = await supabase
        .from('profiles')
        .select('id, preschool_id, organization_id')
        .or(`id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`)
        .maybeSingle();

      if (profileRes.error || !profileRes.data) {
        setError('Could not load teacher profile context.');
        setLoading(false);
        return;
      }

      const profileData = profileRes.data as ProfileContext;
      const schoolId = profileData.preschool_id || profileData.organization_id;
      setProfileContext(profileData);

      const legacyRes = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      const fallbackLegacyRes = legacyRes.data
        ? legacyRes
        : await supabase
            .from('users')
            .select('id')
            .eq('id', profileData.id)
            .maybeSingle();

      if (!fallbackLegacyRes.data?.id) {
        setError('Teacher legacy user mapping is missing. Please sync staff records.');
        setLoading(false);
        return;
      }

      setLegacyTeacherId(fallbackLegacyRes.data.id);

      if (!schoolId) {
        setError('Teacher is not linked to a school.');
        setLoading(false);
        return;
      }

      let classesQuery = supabase
        .from('classes')
        .select('id, name, grade_level, preschool_id, organization_id')
        .order('name', { ascending: true });

      if (profileData.preschool_id) {
        classesQuery = classesQuery.eq('preschool_id', profileData.preschool_id);
      } else {
        classesQuery = classesQuery.eq('organization_id', profileData.organization_id);
      }

      const classesRes = await classesQuery;
      if (classesRes.error) {
        setError(classesRes.error.message || 'Unable to load classes.');
        setLoading(false);
        return;
      }

      const classes = (classesRes.data || []) as ClassOption[];
      setClassOptions(classes);
      if (classes[0]) {
        setClassId(classes[0].id);
      }

      setLoading(false);
    };

    void init();
  }, [router, supabase]);

  const extensionMetadata = useMemo(
    () => ({
      take_home_extension: {
        version: 1,
        worksheet_type: worksheetType,
        age_band: ageBand,
        at_home_steps: steps.map((step) => step.trim()).filter(Boolean),
        repetition_plan: {
          weather_daily: weatherDaily,
          weekdays: repetitionDays,
        },
        parent_prompt: parentPrompt.trim(),
        name_practice: {
          enabled: namePracticeEnabled,
          mode: 'homework_linked_and_optional',
        },
        phonics_pack: {
          id: phonicsPackId,
          locale: 'en-ZA',
          mode: 'bundled',
        },
      },
    }),
    [ageBand, namePracticeEnabled, parentPrompt, phonicsPackId, repetitionDays, steps, weatherDaily, worksheetType],
  );

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const addStep = () => setSteps((prev) => [...prev, '']);

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const uploadAttachments = async (schoolId: string, assignmentId: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];

    for (const file of attachments) {
      const safeName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const path = `homework_assignments/${schoolId}/${assignmentId}/${safeName}`;

      const uploadRes = await supabase.storage
        .from('homework-files')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadRes.error) {
        throw new Error(`Failed to upload ${file.name}`);
      }

      const { data: publicData } = supabase.storage
        .from('homework-files')
        .getPublicUrl(path);

      uploadedUrls.push(publicData.publicUrl);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      if (!userId || !legacyTeacherId || !profileContext) {
        throw new Error('Missing teacher context.');
      }
      if (!classId) {
        throw new Error('Please select a class.');
      }
      if (!title.trim()) {
        throw new Error('Please enter a title.');
      }

      const schoolId = profileContext.preschool_id || profileContext.organization_id;
      if (!schoolId) {
        throw new Error('School context missing.');
      }

      const insertRes = await supabase
        .from('homework_assignments')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || description.trim() || null,
          teacher_id: legacyTeacherId,
          preschool_id: schoolId,
          class_id: classId,
          due_date: dueDate || null,
          grade_band: 'Preschool',
          subject: 'Take-home',
          requires_media: requiresMedia,
          status: 'draft',
          is_published: false,
          is_active: true,
          metadata: extensionMetadata,
          attachment_urls: [],
        })
        .select('id')
        .single();

      if (insertRes.error || !insertRes.data?.id) {
        throw new Error(insertRes.error?.message || 'Failed to create assignment.');
      }

      const assignmentId = insertRes.data.id as string;
      const attachmentUrls = await uploadAttachments(schoolId, assignmentId);

      if (attachmentUrls.length > 0) {
        const updateRes = await supabase
          .from('homework_assignments')
          .update({ attachment_urls: attachmentUrls })
          .eq('id', assignmentId);

        if (updateRes.error) {
          throw new Error(updateRes.error.message || 'Failed to save attachment metadata.');
        }
      }

      const studentsRes = await supabase
        .from('students')
        .select('id')
        .eq('class_id', classId)
        .eq('is_active', true);

      if (studentsRes.error) {
        throw new Error(studentsRes.error.message || 'Unable to load class students.');
      }

      const students = (studentsRes.data || []).map((student: { id: string }) => student.id as string);

      if (students.length > 0) {
        const targetsPayload = students.map((studentId: string) => ({
          assignment_id: assignmentId,
          class_id: classId,
          student_id: studentId,
          preschool_id: schoolId,
          due_at: dueDate || null,
          status: 'assigned',
        }));

        const targetsRes = await supabase
          .from('homework_assignment_targets')
          .insert(targetsPayload as never);

        if (targetsRes.error) {
          throw new Error(targetsRes.error.message || 'Unable to create assignment targets.');
        }

        const submissionsPayload = students.map((studentId: string) => ({
          assignment_id: assignmentId,
          homework_assignment_id: assignmentId,
          student_id: studentId,
          preschool_id: schoolId,
          content_type: 'text',
          content_metadata: {
            source: 'teacher_homework_create_web',
          },
          status: 'draft',
        }));

        await supabase
          .from('homework_submissions')
          .insert(submissionsPayload as never);
      }

      router.push('/dashboard/teacher/homework?created=1');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to create assignment.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <TeacherShell hideHeader>
        <div className="container">
          <div className="section" style={{ textAlign: 'center', padding: 28 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userEmail={shellEmail}
      userName={shellUserName}
      preschoolName={shellPreschoolName}
      hideHeader
    >
      <div className="container">
        <div className="section" style={{ display: 'grid', gap: 12 }}>
          <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText className="icon24" style={{ color: 'var(--primary)' }} />
            Create Take-home Activity
          </h1>
          <p className="muted">Build preschool worksheet assignments with repetition, name-writing practice, and phonics cues.</p>
        </div>

        {error && (
          <div className="section">
            <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)' }}>
              {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="section" style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Assignment Setup</h2>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Worksheet title"
              required
            />
            <textarea
              className="input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary for parents"
            />
            <textarea
              className="input"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Detailed guidance for the activity"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                {classOptions.length === 0 && <option value="">No class available</option>}
                {classOptions.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
              <input
                className="input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={requiresMedia}
                  onChange={(e) => setRequiresMedia(e.target.checked)}
                />
                Parent uploads required
              </label>
            </div>

            <label className="muted" style={{ display: 'grid', gap: 8 }}>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <UploadCloud size={16} /> Worksheet Files (image/PDF)
              </span>
              <input
                className="input"
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              />
            </label>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {attachments.map((file) => (
                  <span key={file.name + file.size} className="badge">{file.name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={18} /> Worksheet Extension Builder
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <select className="input" value={worksheetType} onChange={(e) => setWorksheetType(e.target.value)}>
                <option value="shape-matching">Shape Matching</option>
                <option value="line-tracing">Line Tracing</option>
                <option value="color-patterns">Color Patterns</option>
                <option value="phonics-lab">Phonics Lab</option>
              </select>
              <select className="input" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                <option value="4-5 years">4-5 years</option>
                <option value="5-6 years">5-6 years</option>
              </select>
              <select className="input" value={phonicsPackId} onChange={(e) => setPhonicsPackId(e.target.value)}>
                <option value="starter_en_za_v1">Starter EN-ZA Pack v1</option>
              </select>
            </div>

            <textarea
              className="input"
              rows={2}
              value={parentPrompt}
              onChange={(e) => setParentPrompt(e.target.value)}
              placeholder="Parent facilitation prompt"
            />

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>At-home Steps</div>
              {steps.map((step, index) => (
                <div key={`step-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <input
                    className="input"
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder={`Step ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={steps.length <= 1}
                    onClick={() => removeStep(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="btn" onClick={addStep}>Add Step</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Repetition Plan</div>
              <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={weatherDaily}
                  onChange={(e) => setWeatherDaily(e.target.checked)}
                />
                Include weather repetition each day
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REPETITION_BLOCKS.map((day) => (
                  <label key={day.key} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={repetitionDays[day.key]}
                      onChange={(e) => setRepetitionDays((prev) => ({ ...prev, [day.key]: e.target.checked }))}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={namePracticeEnabled}
                onChange={(e) => setNamePracticeEnabled(e.target.checked)}
              />
              Enable linked name-writing practice
            </label>
          </div>

          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <p className="muted" style={{ margin: 0 }}>
              Assignments are saved as draft and stay compatible with principal approval workflows.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => router.push('/dashboard/teacher/homework')}>
                Cancel
              </button>
              <button type="submit" className="btn btnPrimary" disabled={saving || classOptions.length === 0}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          </div>
        </form>

        <div className="section">
          <div className="card" style={{ padding: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Megaphone size={16} style={{ color: 'var(--primary)' }} />
            <span className="muted" style={{ fontSize: 13 }}>After principal approval and publish, parents see the assignment in Take-home Activities.</span>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
